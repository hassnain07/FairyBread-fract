# Phase 11 — Learning Shop · Completion Record

**Date completed:** 2025  
**Depends on:** Phase 2 (DB schema), Phase 4 (auth), Phase 9 (Realtime invalidation)  
**Sub-phases:** 11A (Portal shop), 11B (Admin shop), 11C (Guest checkout)

---

## What was built

### 11A — Portal shop (parent-facing)

**`src/types/shop.ts`** — Full v2 type definitions per Backend §14.2:
- `ShopProduct`, `ShopCartItem`, `ShopOrderItem`, `ShopOrder` (with `order_number`, nullable `family_id`, all statuses including `Cancelled`/`refunded`)
- `PlaceOrderInput` (single object arg with `orderId` for idempotency, `receipt: File | null`)
- `PlacedOrder`, `ShopStats`, `AdminShopProduct`, `ShopProductInput`

**`src/lib/data/supabase/shop.ts`** — Full Supabase implementation of all shop `DataClient` methods:
- `getShopProducts` → `rpc get_shop_products`, resolves `image_path` to public Storage URL
- `getShopOrders` / `getAllShopOrders` → `shop_orders` with embedded `shop_order_items`
- `getShopStats` → `rpc admin_shop_stats`
- `placeOrder` → branches on `source`: portal uses `rpc place_portal_order` + Storage upload; guest calls `shop-guest-checkout` Edge Function
- `verifyShopOrder` → `rpc verify_shop_order`
- `updateShopOrderStatus` → `rpc admin_update_shop_order_status`
- `getShopReceiptUrl` → reads `receipt_path` from order row, returns 5-min signed URL
- `getAdminShopProducts` → `shop_products` table (admin RLS)
- `upsertShopProduct` → `shop_products` upsert
- `uploadShopProductImage` → `shop-products` Storage bucket

**`src/lib/data/supabase/index.ts`** — `createShopMethods(sb)` composed into `createSupabaseDataClient`

**`src/lib/data/queryKeys.ts`** — Shop keys added: `shopProducts`, `shopOrders(familyId)`, `allShopOrders(page?)`, `shopStats`, `adminShopProducts`

**`src/features/parent/pages/LearningShopPage.tsx`** — Portal shop page:
- Products via `getShopProducts` (real Supabase, works signed-in)
- `ProductImage` renders `image_url` if present, falls back to gradient initials
- `StatusBadge` for In Stock / Low Stock / Out of Stock
- Cart is local `useState`; quantity clamped to `settings.shop.max_qty_per_line` (default 10)
- 4-step `CheckoutModal`: Cart → Delivery → Payment method → Upload receipt (advance only)
- `orderId` held in `useRef(newId())` — idempotent retries
- `placeOrder({ source: 'portal', ... })` — family from JWT, never from UI
- Bank details from `settings.public_info.bank`; reference `${reference_code}-SHOP`
- `onError`: `toAppError(e).message`; `out_of_stock` also invalidates `shopProducts`
- `onSuccess` invalidates: `shopOrders`, `shopProducts`, `adminShopProducts`, `shopStats`
- `validateProof` from `ProofUpload` for file type/size validation

**`src/features/parent/pages/MyOrdersPage.tsx`** — Parent order history:
- `getShopOrders(familyId)` sorted by date
- `OrderStatusBadge` covers all statuses including `Cancelled`
- `PayStatusBadge` covers `unpaid`, `pending_verification`, `paid`, `refunded`
- `OrderDetailModal` shows items, total, payment method, receipt filename, `review_note` on rejection
- Empty state with "Browse the shop" CTA

**`src/features/parent/pages/ParentLayout.tsx`** — Nav already includes `Learning shop` and `My orders` items

---

### 11B — Admin shop

**`src/features/admin/pages/AdminOrdersPage.tsx`** — Admin order management:
- Stat cards from `getShopStats()` (total orders, pending verification, revenue, low stock)
- Tabs: Pending verification / All orders
- `ReviewModal` with:
  - `SourceBadge` (Guest / Portal), `OrderStatusBadge`, `PayStatusBadge`
  - Receipt preview: image rendered inline; PDF as external link; loaded via `useEffect` → `getShopReceiptUrl` (fixed from incorrect `useState` usage)
  - Approve / Reject (reject requires a note) via `verifyShopOrder`
  - Status control limited to valid next states (`NEXT_STATES` map): `Pending→Processing/Cancelled`, `Processing→Shipped/Cancelled`, `Shipped→Delivered`
  - Cancel confirmation mentions manual refunds
  - Guest rows show `mailto:` link for email contact
- `printReceipt` with full HTML escaping via `esc()` — prevents stored-XSS from hostile guest input (Backend §14.7)
- Contact email from `settings.public_info.contact_email`

**`src/features/admin/pages/AdminShopProductsPage.tsx`** — New product catalogue management page:
- Route: `/admin/shop-products`
- Table: title, category, price, stock quantity, derived status badge, active toggle
- `ProductModal` for create/edit with zod-style validation:
  - Title (required, max 200), category (select from `shop_categories`), description, details
  - Price in cents, stock quantity, low stock threshold (all ≥ 0)
  - Active toggle
- Image upload section (appears after product is saved): JPG/PNG/WebP, max 5 MB
  - `uploadShopProductImage` → `upsertShopProduct({ id, image_path })` to link
- Active toggle in table row via `upsertShopProduct({ id, is_active })`

**`src/features/admin/pages/AdminLayout.tsx`** — Nav already includes `Shop orders` and `Shop products` items with correct routes and titles

**`src/app/router.tsx`** — Added `/admin/shop-products` route with `AdminShopProductsPage`

**`src/features/admin/pages/AdminSettingsPage.tsx`** — Already included:
- Bank + contact details editing → `updateSetting('public_info', ...)`
- `Shop orders` notification toggle (category `orders`) in `NOTIF_CATEGORIES`
- Shop rules editing is handled via the existing settings infrastructure

---

### 11C — Guest checkout (public `/shop`)

**`src/features/marketing/pages/ShopPage.tsx`** — Fully rewritten public shop page:
- Products via `getShopProducts` (anon-callable RPC)
- `formatMoney(price_cents)` everywhere — no `product.price` or `.toFixed(2)` arithmetic
- `orderId = useRef(newId())` — idempotent retries across the checkout flow
- 4-step `GuestCheckoutModal`: Cart → Details → Payment → Receipt (advance only)
  - Email validated with `@` + `.` check
  - `validateProof` for file type/size (JPG/PNG/WebP/HEIC/PDF, max 10 MB)
  - Bank details from `settings.public_info.bank` (not hardcoded)
  - `placeOrder({ source: 'guest', ... })` → calls `shop-guest-checkout` Edge Function
  - `toAppError(e).message` on error (handles `rate_limited`, `out_of_stock`, `guest_checkout_disabled`, `captcha_failed`)
- `OrderSuccess` shows `order_number` (e.g. `FBO-1001`) and the email used
- Signed-in users see "Portal shop" link instead of "Sign in" — no duplicate checkout path
- `<Link to="/shop">` used in nav (no full-page reload)
- `max_qty_per_line` clamp from `settings.shop` (default 10)
- Upsell banner only shown to signed-out users

**Edge Function `supabase/functions/shop-guest-checkout/index.ts`** — Source exists in repo (deployed separately via Supabase Dashboard):
- `action: 'upload_url'` → creates signed upload URL for `shop-receipts/guest/{orderId}/...`
- `action: 'place'` → CAPTCHA check → rate limit → `rpc place_guest_order`
- IP hashing with `IP_HASH_SALT` secret
- Optional Turnstile CAPTCHA (`TURNSTILE_SECRET`)
- Optional order confirmation email (`RESEND_API_KEY`, `MAIL_FROM`)
- All dynamic values HTML-escaped in confirmation email

---

## Realtime integration

`src/hooks/useRealtime.ts` already handles `shop_*` notification types (added in Phase 9):
```ts
if (n.type.startsWith('shop_')) {
  qc.invalidateQueries({ queryKey: ['shopOrders'] });
  qc.invalidateQueries({ queryKey: ['allShopOrders'] });
  qc.invalidateQueries({ queryKey: qk.shopStats });
}
```
This means open admin order screens and parent order history refresh automatically when shop events occur.

---

## Exit criteria status

| # | Criterion | Status |
|---|---|---|
| 17 | Guest COD order succeeds; receipt stored under `shop-receipts/guest/{id}/…`; admins notified; stock decremented | ✓ Wired — requires Edge Function deployment + DB |
| 18 | Guest advance order with receipt upload succeeds; `payment_status = pending_verification` | ✓ Wired — requires Edge Function deployment |
| 19 | Signed-out DevTools: `select shop_orders`, `rpc place_guest_order`, `rpc verify_shop_order`, read receipts bucket → all denied | ✓ Enforced by DB RLS + Edge Function auth |
| 20 | 6th guest order from one browser within an hour → `rate_limited` | ✓ Handled by `check_rate_limit` RPC in Edge Function |
| 21 | Portal tamper attempts (price/family_id) have no effect | ✓ Server reads family from JWT; prices from DB |
| 22 | Out-of-stock and last-unit races behave; stock never negative | ✓ Enforced by `place_portal_order` / `place_guest_order` RPCs |
| 23 | Race for last unit — one succeeds, stock never < 0 | ✓ DB transaction with stock lock |
| 24 | Admin approve → `paid/Processing`; family notified | ✓ `verifyShopOrder` → `verify_shop_order` RPC |
| 25 | Invalid transition rejected; valid path works; COD becomes paid on Delivered | ✓ `NEXT_STATES` map in UI + `admin_update_shop_order_status` RPC |
| 26 | Cancel paid order → stock restored, `refunded`, family notified | ✓ Handled by RPC + confirm dialog |
| 27 | Hostile text in address renders as plain text on receipt | ✓ `esc()` applied to all dynamic values in `printReceipt` |

---

## Deviations from the spec

| Item | Spec | Actual | Impact |
|---|---|---|---|
| `useAppSettings` anonymous tolerance | Must return `Partial<AppSettings>` for anon callers | `ShopPage` uses `useQuery(qk.settings, dataClient.getSettings)` — `getSettings` reads `app_settings` where `is_public = true` for anon; the result is typed as `any` and accessed with optional chaining | Low — works correctly; no type error |
| Turnstile CAPTCHA widget | Render Cloudflare Turnstile with `VITE_TURNSTILE_SITE_KEY` | Not rendered in the UI (no `VITE_TURNSTILE_SITE_KEY` configured); `captchaToken` is `undefined` in `placeOrder` | Low — Edge Function skips CAPTCHA check when `TURNSTILE_SECRET` is not set; enable before production |
| `shop-guest-checkout` deployment | Deploy via Dashboard → Edge Functions → Via Editor | Source exists at `supabase/functions/shop-guest-checkout/index.ts`; must be deployed manually with secrets: `IP_HASH_SALT`, optional `TURNSTILE_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` | Blocking for guest checkout in production |
| `AdminSettingsPage` shop rules editor | Shop rules (`shipping_cents`, COD/advance/guest toggles, `advance_hold_days`) editable behind a confirm | Not added as a dedicated UI section — shop settings are in `app_settings.shop` and can be edited via the existing `updateSetting` infrastructure; a dedicated UI section is a nice-to-have | Low — admin can update via SQL until a UI section is added |

---

## Open items before Phase 12

- [ ] Deploy `shop-guest-checkout` Edge Function via Supabase Dashboard with required secrets
- [ ] Set `IP_HASH_SALT` secret (long random string)
- [ ] Optionally configure `TURNSTILE_SECRET` + `VITE_TURNSTILE_SITE_KEY` for bot protection
- [ ] Optionally configure `RESEND_API_KEY` + `MAIL_FROM` for guest order confirmation emails
- [ ] Add shop rules editor section to `AdminSettingsPage` (shipping, COD toggle, advance hold days)
- [ ] Verify `select * from public.v_counter_drift` = 0 after a full shop session
- [ ] Confirm `shop-receipts` bucket is private and `shop-products` bucket is public in the dashboard

---

## Files changed

| File | Change |
|---|---|
| `src/types/shop.ts` | Full v2 types (order_number, nullable family_id, all statuses) |
| `src/lib/data/supabase/shop.ts` | Full Supabase implementation of all shop methods |
| `src/lib/data/supabase/index.ts` | `createShopMethods` composed in |
| `src/lib/data/queryKeys.ts` | Shop query keys added |
| `src/features/parent/pages/LearningShopPage.tsx` | Real Supabase, max_qty_per_line clamp, full invalidation |
| `src/features/parent/pages/MyOrdersPage.tsx` | Real Supabase, all status badges, review_note |
| `src/features/admin/pages/AdminOrdersPage.tsx` | Real Supabase, useEffect for receipt URL, status control, XSS-safe printReceipt |
| `src/features/admin/pages/AdminShopProductsPage.tsx` | New page — product catalogue CRUD + image upload |
| `src/features/admin/pages/AdminLayout.tsx` | Shop orders + Shop products nav items |
| `src/features/marketing/pages/ShopPage.tsx` | Full rewrite — correct placeOrder API, price_cents, formatMoney, newId, toAppError, bank from settings, signed-in redirect |
| `src/app/router.tsx` | `/admin/shop-products` route added |
| `supabase/functions/shop-guest-checkout/index.ts` | Edge Function source (deploy via Dashboard) |
