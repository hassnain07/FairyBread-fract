// firebase-messaging-sw.js — must live at the site root, served as application/javascript.
// The page passes the Firebase config via the registration URL query string because
// service workers cannot read import.meta.env.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const p = new URL(self.location).searchParams;
firebase.initializeApp({
  apiKey:            p.get('apiKey'),
  authDomain:        p.get('authDomain'),
  projectId:         p.get('projectId'),
  messagingSenderId: p.get('messagingSenderId'),
  appId:             p.get('appId'),
});

// FCM auto-displays `notification` payloads when the app is in the background.
firebase.messaging();

// Focus an existing tab (SPA) instead of always opening a new one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url =
    event.notification.data?.FCM_MSG?.fcmOptions?.link ||
    event.notification.data?.FCM_MSG?.data?.action_url ||
    '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({ type: 'NAVIGATE', url: new URL(url, self.location.origin).pathname });
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
