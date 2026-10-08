# Fairybread & Fractions — Shop & Authentication Updates

> This document describes every change made to the project **after** the baseline version the agent already knows. It covers the Learning Shop (parent portal + public marketing site) and the OTP-based authentication overhaul. Read this fully before touching any of the affected files.

---

## 1. New Types — `src/types/shop.ts`

A brand-new file. Four types are exported.

```ts
export type ShopProduct = {
  id: string;
  title: string;
  category: string;       // 'Workbooks' | 'Flash Cards' | 'Activity Kits'
  description: string;    // short, shown on card
  details: string;        // long, shown in product detail modal
  price: number;
  image_url: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
};

export type ShopCartItem = {
  product: ShopProduct;
  quantity: number;
};

export type ShopOrderItem = {
  product_id: string;
  title: string;
  price: number;
  quantity: number;
};

export type ShopOrder = {
  id: string;
  family_id: string;          // 'guest' for public shop orders
  family_name?: string;
  source: 'portal' | 'guest'; // where the order came from
  items: ShopOrderItem[];
  total: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered';
  payment_method: 'cod' | 'advance';
  payment_status: 'unpaid' | 'pending_verification' | 'paid';
  receipt_filename?: string;  // filename of uploaded bank transfer proof
  delivery_name: string;
  delivery_address: string;
  delivery_phone: string;
  delivery_email: string;     // required for guest orders, optional for portal
  created_at: string;         // ISO string
};
```

---

## 2. DataClient Interface — `src/lib/data/types.ts`

Seven new methods added to the `DataClient` interface. Add all three (interface + mock + supabase stub) or none.

```ts
// Shop
getShopProducts(): Promise<ShopProduct[]>;
getShopOrders(familyId: string): Promise<ShopOrder[]>;
getAllShopOrders(): Promise<ShopOrder[]>;
placeOrder(
  familyId: string,
  familyName: string,
  items: ShopCartItem[],
  paymentMethod: 'cod' | 'advance',
  delivery: { name: string; address: string; phone: string; email: string },
  source: 'portal' | 'guest',
  receiptFilename?: string
): Promise<ShopOrder>;
verifyShopOrder(orderId: string, action: 'approve' | 'reject'): Promise<void>;
```

---

## 3. Mock Client — `src/lib/data/mock/client.ts`

### New mock data

```ts
// 6 products across 3 categories
const _mockProducts: ShopProduct[] = [
  { id: 'p1', title: 'Fractions Fun Workbook',      category: 'Workbooks',     price: 18, status: 'In Stock',    ... },
  { id: 'p2', title: 'English Grammar Essentials',  category: 'Workbooks',     price: 20, status: 'In Stock',    ... },
  { id: 'p3', title: 'Reading Comprehension Cards', category: 'Flash Cards',   price: 14, status: 'Low Stock',   ... },
  { id: 'p4', title: 'Times Tables Mastery Pack',   category: 'Flash Cards',   price: 12, status: 'In Stock',    ... },
  { id: 'p5', title: 'Creative Writing Starter Kit',category: 'Activity Kits', price: 28, status: 'In Stock',    ... },
  { id: 'p6', title: 'Maths Problem Solving Pack',  category: 'Activity Kits', price: 24, status: 'Out of Stock', ... },
];

let _shopOrders: ShopOrder[] = [];
```

### `placeOrder` implementation

- Maps `ShopCartItem[]` → `ShopOrderItem[]`
- Calculates `total`
- Sets `payment_status` to `'unpaid'` for COD, `'pending_verification'` for advance
- Stores `delivery_name`, `delivery_address`, `delivery_phone`, `delivery_email`, `source`
- Pushes to `_shopOrders` and returns the new order

### `verifyShopOrder` implementation

- `approve` → sets `payment_status: 'paid'`, `status: 'Processing'`
- `reject` → sets `payment_status: 'unpaid'`, `status: 'Pending'`

### `getShopOrders(familyId)` — filters `_shopOrders` by `family_id`

### `getAllShopOrders()` — returns all `_shopOrders`

---

## 4. Supabase Stub — `src/lib/data/supabase/client.ts`

All five new methods added as throwing stubs:

```ts
async getShopProducts() { throw new Error('Supabase not implemented yet'); },
async getShopOrders()   { throw new Error('Supabase not implemented yet'); },
async getAllShopOrders() { throw new Error('Supabase not implemented yet'); },
async placeOrder()      { throw new Error('Supabase not implemented yet'); },
async verifyShopOrder() { throw new Error('Supabase not implemented yet'); },
```

---

## 5. Router — `src/app/router.tsx`

Four new routes added:

```ts
// Parent portal
{ path: 'shop',   element: <LearningShopPage /> }   // under /parent
{ path: 'orders', element: <MyOrdersPage /> }        // under /parent

// Admin
{ path: 'orders', element: <AdminOrdersPage /> }     // under /admin

// Public marketing site
{ path: '/shop',  element: <PublicShopPage /> }      // top-level, no auth

// Auth
{ path: '/forgot-password', element: <ForgotPasswordPage /> }
```

---

## 6. Parent Portal Nav — `src/features/parent/pages/ParentLayout.tsx`

Two nav items added:

- **Learning shop** → `/parent/shop` (ShoppingBag icon)
- **My orders** → `/parent/orders` (Package icon)

---

## 7. Admin Nav — `src/features/admin/pages/AdminLayout.tsx`

One nav item added:

- **Shop orders** → `/admin/orders` (ShoppingBag icon)

---

## 8. Parent Portal Shop — `src/features/parent/pages/LearningShopPage.tsx`

### Page structure

```
LearningShopPage
├── shop-banner (gradient pink hero with cart button + badge)
├── order success toast (5 s auto-dismiss)
├── shop-toolbar (search input + category filter pills)
├── shop-grid (auto-fill, minmax 260px)
│   └── shop-card × N
│       ├── ProductImage (coloured gradient with initials)
│       ├── category pill + status badge
│       ├── title button → opens ProductModal
│       ├── description
│       └── price + "Add to cart" / "In cart (N)" button
├── ProductModal (product detail + qty selector)
└── CheckoutModal (4-step)
```

### CheckoutModal — 4 steps

| Step | Key | Content |
|------|-----|---------|
| 1 | `'cart'` | Cart review — edit qty, remove items, show total |
| 2 | `'delivery'` | Email, full name, delivery address, phone (name/address/phone required) |
| 3 | `'payment'` | Choose COD or Advance bank transfer |
| 4 | `'proof'` | Advance only — bank details card + file upload (image/PDF) |

- COD: step 3 → `placeOrder()` immediately, `payment_status: 'unpaid'`
- Advance: step 3 → step 4 → upload file → `placeOrder()`, `payment_status: 'pending_verification'`
- On success: cart cleared, modal closed, 5 s success toast shown
- `source` is always `'portal'` from this page

### Data flow

```
addToCart (local state)
  → CheckoutModal
    → useMutation → dataClient.placeOrder(...)
      → onSuccess → invalidateQueries(['shopOrders', familyId])
```

---

## 9. Parent Portal My Orders — `src/features/parent/pages/MyOrdersPage.tsx`

- Fetches `dataClient.getShopOrders(familyId)` via `useQuery(['shopOrders', familyId])`
- Sorted newest-first
- Each `order-card` shows: order ID, item count, total, date, order status badge, payment status badge, "View details" button
- `OrderDetailModal` shows full item breakdown, payment method, payment status, receipt filename if present
- Empty state with link to shop

---

## 10. Admin Orders Page — `src/features/admin/pages/AdminOrdersPage.tsx`

### Stat cards (3)
- Total orders
- Pending verification count
- Revenue received (sum of `paid` orders)

### Table tabs
- **Pending verification** — filters `payment_status === 'pending_verification'`
- **All orders** — shows everything

### Table columns
`Order ID | Source | Customer | Email | Deliver to | Items | Total | Payment | Pay status | Order status | Date | Actions`

- **Source** badge: Guest (yellow) or Portal (green)
- **Deliver to** cell: name (bold) + address + phone stacked
- **Actions** cell: "Review" button (advance pending only) + "Receipt" button (all orders)

### Review modal
Shows: source badge, customer name, email, order ID, delivery address, item breakdown, total, uploaded receipt preview. Actions: Reject / Approve payment.

### Receipt generation — `printReceipt(order)`
Opens a new browser tab with a clean HTML receipt and triggers `window.print()`. Receipt includes: order ID, date, payment method + status badge, delivery details (name/address/phone/email), itemised table, total, footer with contact email.

### Data flow
```
useQuery(['allShopOrders']) → dataClient.getAllShopOrders()
useMutation → dataClient.verifyShopOrder(id, 'approve' | 'reject')
  → onSuccess → invalidateQueries(['allShopOrders'])
```

---

## 11. Public Marketing Shop — `src/features/marketing/pages/ShopPage.tsx`

Accessible at `/shop` — **no authentication required**.

### Page structure

```
PublicShopPage
├── topbar (same brand, nav with "Shop" link highlighted pink)
├── public-shop-hero (larger gradient banner)
├── OrderSuccess screen (replaces grid after order placed)
├── shop-toolbar (search + filters)
├── shop-grid (same product cards as portal)
├── ProductModal (same as portal)
├── public-shop-upsell (pink border card — "Already a family? Sign in")
└── GuestCheckoutModal (4-step)
```

### GuestCheckoutModal — 4 steps

| Step | Key | Content |
|------|-----|---------|
| 1 | `'cart'` | Cart review |
| 2 | `'details'` | Email (required + validated), full name, address, phone |
| 3 | `'payment'` | COD or Advance |
| 4 | `'proof'` | Bank details + file upload (advance only) |

- Step indicator bar at top of modal showing all 4 steps with done/active/pending states
- `family_id` is set to `'guest'`, `source` is `'guest'`
- On success: `onSuccess(orderId, email)` bubbles up → `OrderSuccess` screen shown inline (not a modal)
- `OrderSuccess` shows order ID + email used, with "Continue shopping" button

### Landing page nav update — `src/features/marketing/pages/LandingPage.tsx`

```tsx
<nav>
  <a href="#how">How it works</a>
  <a href="#why">Why fairybread?</a>
  <a href="/shop" style={{ color: 'var(--pink)', fontWeight: 700 }}>Shop</a>  {/* NEW */}
</nav>
```

---

## 12. Authentication Changes

### Overview of what changed

| Page | Before | After |
|------|--------|-------|
| `/signup` | 2 steps: Details → Password | 4 steps: Details → **OTP verify** → Password → Done |
| `/login` | Email + password | Unchanged — "Forgot password?" link now has a real page |
| `/forgot-password` | Did not exist | New page: Email → **OTP verify** → New password → Done |

---

### Shared OTP Component — `src/features/auth/components/OtpInput.tsx`

Reusable component used by both signup and forgot-password.

**Props:**
```ts
interface OtpInputProps {
  heading: string;
  subheading: ReactNode;   // can include <strong> tags
  stepLabel?: string;      // e.g. "Step 2 of 3"
  onVerified: () => void;  // called when correct OTP entered
  onBack: () => void;
  onResend: () => Promise<void>;
}
```

**Behaviour:**
- 6 individual `<input>` boxes, each accepting one digit
- Auto-advances focus to next box on digit entry
- Backspace on empty box moves focus to previous box
- Supports paste of full 6-digit code into any box
- 30-second resend countdown timer; "Resend code" button appears after countdown
- Error state: all boxes get pink border + `auth-error` banner
- Filled boxes turn teal (`otp-box-filled` class)
- Mock OTP is always `123456` — a demo hint is shown below the heading
- TODO comment marks where `supabase.auth.verifyOtp({ email, token, type: 'email' })` goes

**CSS classes:** `.otp-boxes`, `.otp-box`, `.otp-box-filled`, `.otp-box-error`, `.otp-resend`, `.otp-resend-btn`, `.otp-heading-icon`, `.otp-demo-hint`

---

### Signup Page — `src/features/auth/pages/SignupPage.tsx`

**Steps (0-indexed):**

```
step 0 — Your details
  Fields: first name, last name, email, phone (optional)
  Submit: validates → simulates sending OTP → advances to step 1
  TODO: call supabase.auth.signInWithOtp({ email })

step 1 — Verify email  (OtpInput component)
  onVerified → advances to step 2
  onBack → returns to step 0
  onResend → re-sends OTP (TODO: Supabase call)

step 2 — Set password
  Fields: password (with strength meter), confirm password, agree to terms checkbox
  Submit: validates → simulates account creation → advances to step 3
  TODO: supabase.auth.signUp({ email, password }) + profiles insert

step 3 — Success
  Shows what's next checklist
  Button: "Go to my portal" → navigate('/parent')
```

Left panel step indicator updates as user progresses through all 4 steps.

---

### Forgot Password Page — `src/features/auth/pages/ForgotPasswordPage.tsx`

Route: `/forgot-password`

**Steps (0-indexed):**

```
step 0 — Enter email
  Field: email address
  Submit: validates email format → simulates sending OTP → advances to step 1
  TODO: supabase.auth.resetPasswordForEmail(email) or signInWithOtp({ email })

step 1 — Verify code  (OtpInput component)
  onVerified → advances to step 2
  onBack → returns to step 0
  onResend → re-sends OTP (TODO: Supabase call)

step 2 — New password
  Fields: new password (with strength meter), confirm new password
  Submit: validates → simulates password update → advances to step 3
  TODO: supabase.auth.updateUser({ password })

step 3 — Done
  Success message
  Button: "Sign in now" → navigate('/login')
```

Left panel shows step indicator for all 4 steps. Hero text: "Reset your password ✦".

---

### Login Page — `src/features/auth/pages/LoginPage.tsx`

**No structural changes.** The "Forgot password?" link already pointed to `/forgot-password` — it now has a real page behind it. Mock credentials unchanged:

| Email | Password | Role | Family ID |
|-------|----------|------|-----------|
| sarah@example.com | demo1234 | parent | f1 |
| claire@example.com | demo1234 | parent | f2 |
| james@example.com | demo1234 | parent | f3 |
| michael@example.com | demo1234 | parent | f4 |
| admin@fairybread.au | admin1234 | admin | — |
| jessica@fairybread.au | tutor1234 | teacher | — |
| sarah.w@fairybread.au | tutor1234 | teacher | — |

---

## 13. CSS — `src/index.css`

All new classes appended at the end of the file. No existing classes were modified.

### Shop classes (portal + public)
`.shop-banner`, `.shop-banner-text`, `.shop-cart-btn`, `.shop-cart-badge`, `.shop-order-success`, `.shop-toolbar`, `.shop-search-wrap`, `.shop-search-icon`, `.shop-search`, `.shop-filters`, `.shop-filter-btn`, `.shop-empty`, `.shop-grid`, `.shop-card`, `.shop-product-img`, `.shop-img-{pink|teal|yellow|orange|green}`, `.shop-card-body`, `.shop-card-top`, `.shop-category-pill`, `.shop-status-badge`, `.shop-status-{instock|low|out}`, `.shop-card-title`, `.shop-card-desc`, `.shop-card-footer`, `.shop-card-price`, `.shop-card-actions`, `.shop-view-btn`, `.shop-detail-modal`, `.shop-detail-desc`, `.shop-detail-meta`, `.shop-detail-price`, `.shop-detail-actions`, `.shop-out-msg`, `.shop-qty-ctrl`, `.shop-cart-modal`, `.shop-cart-head`, `.shop-cart-empty`, `.shop-cart-list`, `.shop-cart-row`, `.shop-cart-row-info`, `.shop-cart-row-total`, `.shop-cart-remove`, `.shop-cart-footer`, `.shop-cart-total`, `.orders-list`, `.order-card`, `.order-card-icon`, `.order-card-info`, `.order-card-date`, `.order-card-right`

### Checkout method selection
`.checkout-method-options`, `.checkout-method-btn`, `.checkout-method-icon`, `.checkout-method-check`

### Public shop specific
`.public-shop-site`, `.public-shop-hero`, `.public-shop-hero-text`, `.public-shop-upsell`, `.public-shop-upsell-text`, `.public-shop-success`, `.public-shop-success-icon`, `.public-shop-success-id`

### Guest checkout step indicator
`.guest-checkout-steps`, `.guest-step` (modifiers: `.active`, `.done`)

### OTP
`.otp-heading-icon`, `.otp-demo-hint`, `.otp-boxes`, `.otp-box`, `.otp-box-filled`, `.otp-box-error`, `.otp-resend`, `.otp-resend-btn`

---

## 14. File Map — What Exists Now

```
src/
├── types/
│   └── shop.ts                          ← NEW
├── lib/data/
│   ├── types.ts                         ← updated (5 new methods)
│   ├── mock/client.ts                   ← updated (mock products, _shopOrders, 5 new methods)
│   └── supabase/client.ts               ← updated (5 new stubs)
├── app/
│   └── router.tsx                       ← updated (4 new routes)
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   └── OtpInput.tsx             ← NEW
│   │   └── pages/
│   │       ├── LoginPage.tsx            ← unchanged
│   │       ├── SignupPage.tsx           ← updated (OTP step added)
│   │       └── ForgotPasswordPage.tsx   ← NEW
│   ├── marketing/
│   │   └── pages/
│   │       ├── LandingPage.tsx          ← updated (Shop nav link)
│   │       └── ShopPage.tsx             ← NEW
│   ├── parent/
│   │   └── pages/
│   │       ├── ParentLayout.tsx         ← updated (2 new nav items)
│   │       ├── LearningShopPage.tsx     ← NEW
│   │       └── MyOrdersPage.tsx         ← NEW
│   └── admin/
│       └── pages/
│           ├── AdminLayout.tsx          ← updated (1 new nav item)
│           └── AdminOrdersPage.tsx      ← NEW
└── index.css                            ← updated (new classes appended)
```

---

## 15. Key Architecture Rules (unchanged from baseline)

- All data goes `component → useQuery/useMutation → dataClient`. No direct mock imports in components.
- Every new DataClient method must be added to (a) interface in `types.ts`, (b) mock `client.ts`, (c) supabase `client.ts` stub — all three or none.
- Global CSS classes in `index.css` are the primary styling mechanism. No new inline style blobs for reusable UI.
- Cart state is local (`useState`) inside each shop page — it is **not** persisted to the DataClient or React Query cache. Only placed orders are persisted.
- OTP mock code is always `123456`. The `OtpInput` component has a `// TODO` comment at every point where a real Supabase call should replace the mock `setTimeout`.
