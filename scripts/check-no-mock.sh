#!/usr/bin/env bash
# scripts/check-no-mock.sh
# Fails (exit 1) if any mock/demo artifacts remain in src/.
# Run via: npm run check:no-mock

set -euo pipefail
FAIL=0

check() {
  local label="$1"; shift
  if grep -rn "$@" src/ 2>/dev/null; then
    echo "FAIL: $label"
    FAIL=1
  fi
}

# 1) No mock/demo infrastructure
check "mock imports or TEMP-LEGACY" \
  -E "lib/data/mock|TEMP-LEGACY|VITE_DATA_SOURCE|DemoBar|MOCK_CREDENTIALS|otp-demo-hint|_mockProducts|_shopOrders|'123456'"

# 2) No hard-coded family/teacher/child IDs or real names (LandingPage excluded — decorative only)
check "hard-coded IDs or seed names" \
  --include="*.ts" --include="*.tsx" \
  -E "'f[1-4]'|'tch[1-3]'|'c[1-6]'|'ci[1-4]'|Sarah Johnson|Claire Brown|James Taylor|Michael Chen|Jessica Taylor|Daniel Smith|Therese|FAMILY_NAMES|FAMILY_EMAILS|FAMILY_PHONES|ALL_FAMILY_IDS|ALL_IDS|CLASS_OPTIONS" \
  --exclude="*LandingPage.tsx"

# 3) Supabase SDK only under lib/data/supabase/ and lib/supabase.ts
if grep -rn "supabase\.\(from\|rpc\|storage\|auth\|channel\)" src/ --include="*.ts" --include="*.tsx" \
   | grep -v "src/lib/data/supabase/" \
   | grep -v "src/lib/supabase.ts" \
   | grep -v "src/hooks/useRealtime.ts"; then
  echo "FAIL: supabase SDK called outside lib/data/supabase/"
  FAIL=1
fi

# 4) No client-side pricing arithmetic
check "client-side pricing math" \
  -E "\* *(1\.1|0\.1)|GST_RATE|TERM_BASE_PRICE|REGISTRATION_FEE|INDIVIDUAL_CLASS_PRICE"

# 5) No dangerouslySetInnerHTML (XSS risk)
check "dangerouslySetInnerHTML" -E "dangerouslySetInnerHTML"

# 6) No guest sentinel in component code
check "guest family_id sentinel" \
  --include="*.tsx" \
  -E "family_id === 'guest'|familyId === 'guest'"

# 7) No secrets in src/ or public/
check "secrets in source" \
  -E "service_role|FIREBASE_SERVICE_ACCOUNT|PUSH_WEBHOOK_SECRET|IP_HASH_SALT|TURNSTILE_SECRET|RESEND_API_KEY"

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "check:no-mock FAILED — fix the items above before merging."
  exit 1
else
  echo "check:no-mock passed."
fi
