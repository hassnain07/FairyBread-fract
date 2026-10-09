import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, isSupported, onMessage } from 'firebase/messaging';
import { dataClient } from '../data/client';

const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// localStorage is allowed here per rules.md §3 — stores a device token string only, not business data.
const TOKEN_KEY = 'fb_fcm_token';

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted';

export async function pushState(): Promise<PushState> {
  if (!(await isSupported()) || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushState;
}

async function swRegistration(): Promise<ServiceWorkerRegistration> {
  const qs = new URLSearchParams(cfg as Record<string, string>).toString();
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`, { scope: '/' });
}

function getOrInitMessaging() {
  if (!getApps().length) initializeApp(cfg);
  return getMessaging();
}

/**
 * MUST be called from a user gesture (button click) the first time.
 * Browsers block unprompted permission requests.
 */
export async function enablePush(): Promise<'ok' | PushState> {
  const st = await pushState();
  if (st === 'unsupported' || st === 'denied') return st;
  if (st === 'default' && (await Notification.requestPermission()) !== 'granted') return 'denied';
  return (await syncToken()) ? 'ok' : 'unsupported';
}

/**
 * Idempotent. Call after every login and on every app start while permission is already granted.
 * Keeps last_seen_at fresh for the 90-day pruning cron.
 */
export async function syncToken(): Promise<string | null> {
  if ((await pushState()) !== 'granted') return null;
  const token = await getToken(getOrInitMessaging(), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await swRegistration(),
  });
  if (!token) return null;
  await dataClient.registerDevice!(token, 'web', { locale: navigator.language });
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

/**
 * Call BEFORE signOut so the next person on this browser doesn't receive this user's pushes.
 */
export async function disablePushForThisDevice(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try { await dataClient.unregisterDevice!(token); } catch { /* pruned server-side */ }
  try { await deleteToken(getOrInitMessaging()); } catch { /* ignore */ }
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Optional: foreground messages (tab visible).
 * The Realtime channel already updates the bell; this adds a toast for foreground pushes.
 */
export function onForegroundPush(
  cb: (p: { title: string; body: string; url?: string }) => void
): () => void {
  return onMessage(getOrInitMessaging(), m => {
    const title = m.notification?.title ?? '';
    const body  = m.notification?.body  ?? '';
    cb({ title, body, url: m.data?.action_url });
  });
}
