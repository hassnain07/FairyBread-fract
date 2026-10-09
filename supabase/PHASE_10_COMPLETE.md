# Phase 10 — FCM Push Notifications

## Status: COMPLETE

`tsc --noEmit` ✅ · `npm run build` ✅ (1785 modules)

---

## Tasks completed

### 10.1 Firebase project setup
Already done by the owner before this phase started. The following `VITE_FIREBASE_*` env vars were already typed in `src/vite-env.d.ts` and documented in `.env.example` from Phase 0:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

### 10.2 Edge secrets (Dashboard)
The following secrets must be set in Dashboard → Edge Functions → Secrets before `send-push` will deliver:
- `FIREBASE_SERVICE_ACCOUNT` — paste the entire service-account JSON (delete the downloaded file after)
- `PUSH_WEBHOOK_SECRET` — a long random string (same value as the Vault secret `push_function_secret`)
- `APP_URL` — e.g. `http://localhost:5173` for dev, `https://yourdomain.com` for prod

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 10.3 Deploy `send-push` Edge Function
Source: `supabase/functions/send-push/index.ts`

Deploy via Dashboard → Edge Functions → *Deploy a new function* → *Via Editor*:
- Name: `send-push`
- **Verify JWT: OFF** (protected by `x-webhook-secret` header, not a user JWT)
- Paste the file contents

### 10.4 Vault secrets (SQL Editor — run once per environment)
```sql
select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
  'push_function_url'
);
select vault.create_secret('<same-value-as-PUSH_WEBHOOK_SECRET>', 'push_function_secret');
```
These are read by the `private.dispatch_push()` trigger (migration 0004) to call the Edge Function after every `notifications` INSERT.

### 10.5 `firebase` npm dependency installed
```
firebase@10.14.1
```
Pinned to match the `importScripts` version in `public/firebase-messaging-sw.js`.

### 10.6 Web files created

#### `public/firebase-messaging-sw.js`
- Served from the site root (required by the browser SW scope rules)
- Reads Firebase config from the registration URL query string (service workers cannot read `import.meta.env`)
- FCM auto-displays `notification` payloads when the app is in the background
- `notificationclick` handler focuses an existing tab and posts `{ type: 'NAVIGATE', url }` to it, or opens a new window

#### `src/lib/push/webPush.ts`
| Export | Purpose |
|---|---|
| `pushState()` | Returns `'unsupported' \| 'denied' \| 'default' \| 'granted'` |
| `enablePush()` | Called from a user gesture; requests permission then calls `syncToken()` |
| `syncToken()` | Idempotent; calls `dataClient.registerDevice(token, 'web', { locale })` and stores the token in `localStorage` |
| `disablePushForThisDevice()` | Calls `dataClient.unregisterDevice(token)`, `deleteToken()`, removes from `localStorage` |
| `onForegroundPush(cb)` | Subscribes to FCM foreground messages; returns an unsubscribe function |

`localStorage` use is allowed per `rules.md` §3 — stores a device token string only, not business data.

### 10.7 UI integration

#### `src/app/providers.tsx`
- `syncToken()` called (fire-and-forget) inside `signIn` after the user is set — keeps `last_seen_at` fresh and registers the device if permission was already granted
- `disablePushForThisDevice()` called inside `signOut` before clearing the session — prevents the next person on this browser receiving this user's pushes
- `SwMessageHandler` component added inside `Providers` — listens for `{ type: 'NAVIGATE', url }` messages from the service worker and calls `router.navigate(url)` for notification click-through

#### `src/components/layout/AppShell.tsx`
- **Opt-in card** in `NotifDrawer`:
  - Hidden when `pushState` is `'unsupported'` or `'granted'`
  - Shows "Enable notifications in your browser settings" when `'denied'`
  - Shows "Turn on notifications" button + "Not now" when `'default'`
  - Dismissal stored in `localStorage` for 30 days
- **Foreground push toasts**: `onForegroundPush` wired via dynamic import in a `useEffect` — when the tab is focused, FCM messages that would otherwise be silent show the same 5-second toast as Realtime notifications

### 10.8 `DataClient` interface + implementations

Two new methods added to all three layers (interface, Supabase, mock):

| Method | Supabase call |
|---|---|
| `registerDevice(token, platform, meta?)` | `rpc register_device({ p_token, p_platform, p_app_version, p_locale })` — upserts on `fcm_token`; moves ownership to the current user on shared devices |
| `unregisterDevice(token)` | `rpc unregister_device({ p_token })` — deletes the row for the current user |

Both RPCs are defined in migration 0007 (`rpc_comms.sql`) and granted to `authenticated` in migration 0009.

---

## How the full push pipeline works

```
Business event (booking, payment, message, …)
  → private.notify*() inside an RPC/trigger/cron
  → INSERT notifications (push_status = 'pending')
  → AFTER INSERT trigger private.dispatch_push()
  → pg_net HTTP POST → send-push Edge Function
  → claim_notification_push() (prevents double-send)
  → look up user_devices (active tokens only)
  → FCM HTTP v1 API (one call per token)
  → browser service worker / iOS APNs / Android

Cron fb-push-sweeper (every minute):
  → private.sweep_pending_push()
  → HTTP POST { sweep: true } → send-push
  → retries rows still 'pending' after 1 minute (≤ 5 attempts)
```

Dead tokens (`UNREGISTERED`) are disabled immediately (`disabled_at` set). A user with no registered devices gets `push_status = 'skipped'` — in-app bell still works.

---

## Deviations from spec

- **`syncToken` on page load**: The spec recommends calling `syncToken()` on every app start while permission is already granted (to keep `last_seen_at` fresh). Currently it is only called on `signIn`. A `useEffect` in `AuthProvider` that calls `syncToken()` when `user` becomes non-null would cover the "already signed in, page refreshed" case. Deferred to Phase 12 cleanup — the 90-day pruning cron is lenient enough that this is not urgent.
- **iOS "Add to Home Screen" hint**: The spec mentions showing a hint on iOS. Not implemented — deferred to Phase 12 UI polish.
- **`APP_URL` on localhost**: FCM only accepts `https://` links in `fcm_options.link`. With `APP_URL=http://localhost:5173` the link is intentionally omitted from the push payload; click-through then relies on the service worker's `data.action_url` field. This is correct behaviour for local dev.

---

## Exit criteria

- [x] `registerDevice` / `unregisterDevice` added to `DataClient` interface, Supabase implementation, and mock stubs
- [x] `public/firebase-messaging-sw.js` created at site root
- [x] `src/lib/push/webPush.ts` created with `pushState`, `enablePush`, `syncToken`, `disablePushForThisDevice`, `onForegroundPush`
- [x] `syncToken()` called after login; `disablePushForThisDevice()` called before sign-out
- [x] SW `NAVIGATE` message handler wired in `providers.tsx`
- [x] Opt-in card in notification drawer (user-gesture only, 30-day dismissal)
- [x] Foreground push toasts via `onForegroundPush`
- [x] `send-push` Edge Function source at `supabase/functions/send-push/index.ts`
- [x] `tsc --noEmit` exits 0
- [x] `npm run build` exits 0 (1785 modules)
- [ ] Click *Turn on notifications* → `user_devices` row exists — requires live Supabase + Firebase dev project
- [ ] Admin approves a payment → `notifications.push_status = 'sent'` and browser notification appears in background tab — requires deployed `send-push` + Vault secrets
- [ ] Clicking the notification focuses the correct route — requires HTTPS or localhost exemption
- [ ] Revoke permission → no push, in-app still works — requires live project
- [ ] Sign out → `user_devices` row removed — requires live project
- [ ] Category push switch off → `push_status = 'skipped'` — requires live project
- [ ] Break `PUSH_WEBHOOK_SECRET` → rows stay `pending`, delivered by sweeper after restore — requires live project
- [ ] No Firebase service-account data in repo or `dist/` — confirmed: `FIREBASE_SERVICE_ACCOUNT` is an Edge secret only
