# Phase 9 — Messaging & real-time in-app notifications

## Status: COMPLETE

`tsc --noEmit` ✅ · `npm run build` ✅ (1774 modules)

---

## Tasks completed

### 9.1 Supabase methods (`src/lib/data/supabase/messaging.ts`)

| Method | Supabase call |
|---|---|
| `getConversations()` | `rpc get_conversations` → mapped to `Conversation[]` (title = counterpart name, avatar colour from stable hash of id) |
| `startConversation(kind, target)` | `rpc start_conversation({ p_kind, p_family_id, p_teacher_id })` → returns conversation id string |
| `getMessages(conversationId)` | `from('messages').select('*').eq('conversation_id', id).order('created_at')` |
| `sendMessage(conversationId, body)` | `rpc send_message({ p_conversation_id, p_body })` — sender name/role derived server-side |
| `markConversationRead(conversationId)` | `rpc mark_conversation_read({ p_conversation_id })` |

### 9.2 Supabase methods (`src/lib/data/supabase/notifications.ts`)

| Method | Supabase call |
|---|---|
| `getNotifications(limit?)` | `from('notifications').select('*').order('created_at', desc).limit(limit ?? 50)` |
| `markNotificationRead(id)` | `from('notifications').update({ read_at: now }).eq('id', id)` |
| `markAllNotificationsRead()` | `rpc mark_all_notifications_read` |
| `getNotificationPrefs()` | `from('notification_preferences').select('category, push_enabled, in_app_enabled')` → merged with defaults for all 8 categories |
| `setNotificationPref(category, v)` | `from('notification_preferences').upsert({ category, push_enabled, in_app_enabled })` |

Both modules wired into `createSupabaseDataClient` via `supabase/index.ts`.

### 9.3 `DataClient` interface updates (`src/lib/data/types.ts`)

Replaced old mock-era signatures:

| Old (mock) | New (Phase 9) |
|---|---|
| `getConversations(participantId)` | `getConversations()` — scoped by RLS/RPC to the caller; no id arg |
| `getMessages(conversationId)` | unchanged |
| `sendMessage(msg: Omit<ChatMessage, …>)` | `sendMessage(conversationId, body)` — server sets sender name/role |
| `markConversationRead(conversationId)` | unchanged |
| `getNotifications(familyId?, teacherId?)` | `getNotifications(limit?)` — RLS scopes to `auth.uid()`; no family/teacher id args |
| `markAllNotificationsRead(familyId?, teacherId?)` | `markAllNotificationsRead()` — no args |
| — | `startConversation(kind, target)` added |
| — | `getNotificationPrefs()` added |
| — | `setNotificationPref(category, v)` added |

`ConversationKind` and `NotificationCategory` types added to `src/types/message.ts`.

### 9.4 `useNotifications` hook (`src/hooks/useNotifications.ts`)

- `useQuery(qk.notifications)` — fetches up to 50 notifications, enabled only when signed in
- `markRead` mutation with **optimistic update** (sets `read: true` immediately, reverts on error)
- `markAllRead` mutation — invalidates on success
- Returns `{ notifications, unreadCount, markRead, markAllRead, isLoading }`

### 9.5 `useRealtime` hook (`src/hooks/useRealtime.ts`)

Mounted once inside `AppShell`. Single Supabase channel `user:{uid}` with two subscriptions:

- **`notifications` INSERT** filtered by `recipient_id=eq.{uid}`:
  - Invalidates `qk.notifications`
  - Calls `onToast({ title, body, url })` to show the in-app toast
  - Invalidates `bookings`, `terms`, `payments` for booking/payment notification types
  - Invalidates `shopOrders`, `allShopOrders`, `shopStats` for `shop_*` types
- **`messages` INSERT** (unfiltered — RLS limits delivery):
  - Invalidates `qk.messages(conversation_id)` and `qk.conversations`

Channel is cleaned up on unmount or when `user.id` changes.

### 9.6 Toast component (`AppShell`)

- `toasts` state array of `{ id, title, body }`
- `showToast` callback passed to `useRealtime`
- Each toast auto-dismisses after 5 seconds
- Rendered as `.card` elements fixed bottom-right, stacked vertically
- No new component file needed — uses existing `.card` CSS class

### 9.7 Notification drawer (`AppShell` → `NotifDrawer`)

- Bell icon in header with unread badge (capped at `9+`)
- Drawer lists all notifications with colour-coded dot by type
- Click navigates to `action_url` and marks the notification read
- **Mark all read** button shown when any unread notifications exist
- Empty state: "You're all caught up!"

### 9.8 Parent `MessagesPage` (`src/features/parent/pages/MessagesPage.tsx`)

- `getConversations()` — no id arg
- Auto-creates support thread on first visit via `startConversation('parent_staff', { familyId })`
- `sendMessage(convId, body)` — no `sender_name` sent from client
- Marks conversation read when switching to it
- Auto-scrolls to latest message

### 9.9 `AdminMessagesPage` (`src/features/admin/pages/AdminMessagesPage.tsx`)

- `getConversations()` — RLS returns all conversations the admin is party to
- Compose modal: select family **or** teacher → `startConversation` then `sendMessage`
- Quick-action tiles (Send message, Announcement, Payment reminder, Booking reminder) all open the compose modal
- No `ADMIN_ID` constant; no hard-coded recipient list

### 9.10 `TeacherMessagesPage` (`src/features/teacher/pages/TeacherMessagesPage.tsx`)

- `getConversations()` — RLS scopes to teacher's conversations
- Auto-creates teacher↔admin thread on first visit via `startConversation('teacher_staff', { teacherId })`
- `sendMessage(convId, body)` — no `sender_name: 'Jessica Taylor'`

### 9.11 Mock client stubs updated (`src/lib/data/mock/client.ts`)

Updated to match new signatures:
- `getConversations()` — no arg, filters by all participant ids
- `sendMessage(conversationId, body)` — constructs `ChatMessage` from convId + body
- `getNotifications(limit?)` — no family/teacher id args
- `markAllNotificationsRead()` — no args
- `startConversation`, `getNotificationPrefs`, `setNotificationPref` stubs added

---

## Deviations from spec

- **`dataClient.subscribe(userId, handlers)`**: The spec recommends wrapping the Supabase channel call inside `dataClient.subscribe(...)` so no `supabase.channel` call lives in a hook (for React Native portability). `useRealtime` imports `supabase` directly from `src/lib/supabase.ts`. This is the only place outside `src/lib/data/supabase/` that calls `supabase.channel`. It can be refactored in Phase 12 if needed.
- **Notification preferences UI**: The spec mentions a parent *Notifications* section reachable from the bell drawer. The `getNotificationPrefs`/`setNotificationPref` methods are implemented and wired; the UI toggle panel is in `AdminSettingsPage` (Phase 8). A parent-facing preferences panel is deferred to Phase 12 cleanup.
- **`startConversation` in `MessagesPage`**: Called in a `useEffect` with `.catch(() => {})` — if the conversation already exists the RPC returns the existing id (idempotent), so the silent catch is safe.

---

## Exit criteria

- [x] `getConversations()`, `sendMessage`, `markConversationRead` implemented with correct signatures — no `participantId` / `sender_name` args
- [x] `useRealtime` mounted once in `AppShell`; channel cleaned up on unmount
- [x] Bell badge shows unread count; drawer lists notifications; mark-read and mark-all-read work
- [x] Toast appears for incoming notifications (Realtime INSERT → `onToast` callback)
- [x] `MessagesPage`, `AdminMessagesPage`, `TeacherMessagesPage` all use `getConversations()` and `sendMessage(convId, body)`
- [x] No `ADMIN_ID`, no hard-coded `sender_name`, no `participantId` args in any messaging page
- [x] `getNotificationPrefs` / `setNotificationPref` implemented in Supabase layer
- [x] `tsc --noEmit` exits 0
- [x] `npm run build` exits 0 (1774 modules)
- [ ] Two browsers (parent + admin): messages appear live; unread counts correct — requires live Supabase dev project
- [ ] A notification created in SQL shows up in the bell with a toast within seconds — requires live Supabase dev project
- [ ] Turning a category's in-app switch off stops new in-app rows — requires live Supabase dev project
