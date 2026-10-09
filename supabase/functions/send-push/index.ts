// supabase/functions/send-push/index.ts
// Deploy via Dashboard → Edge Functions → Via Editor, name: send-push, Verify JWT: OFF
// Required secrets: FIREBASE_SERVICE_ACCOUNT (full JSON), PUSH_WEBHOOK_SECRET, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'npm:jose@5';

const SA      = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);
const SECRET  = Deno.env.get('PUSH_WEBHOOK_SECRET')!;
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

// ── Google OAuth2 access token (cached ~55 min per warm instance) ─────────────
let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = await importPKCS8(SA.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(SA.client_email).setSubject(SA.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

type Result = 'ok' | 'dead' | 'retry';
async function sendOne(token: string, n: any, badge: number): Promise<Result> {
  const link = n.action_url ? `${APP_URL}${n.action_url}` : APP_URL;
  const data: Record<string, string> = {
    notification_id: n.id, type: n.type, action_url: n.action_url ?? '',
    ...Object.fromEntries(Object.entries(n.data ?? {}).map(([k, v]) => [k, String(v)])),
  };
  const message = {
    token,
    notification: { title: n.title, body: n.body },
    data,
    webpush: {
      // FCM only accepts https links; with a dev APP_URL of http://localhost the link is omitted
      ...(link.startsWith('https://') ? { fcm_options: { link } } : {}),
      notification: { icon: `${APP_URL}/assets/image.png`, tag: n.id },
    },
    android: { priority: 'HIGH', notification: { channel_id: 'default', tag: n.id } },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', badge } } },
  };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }
  );
  if (res.ok) return 'ok';
  const err = await res.json().catch(() => ({}));
  const status = err?.error?.status as string | undefined;
  const code = err?.error?.details?.find((d: any) => d.errorCode)?.errorCode as string | undefined;
  if (
    status === 'NOT_FOUND' ||
    code === 'UNREGISTERED' ||
    (code === 'INVALID_ARGUMENT' && /token/i.test(err?.error?.message ?? ''))
  ) return 'dead';
  return 'retry';
}

async function process(id: string) {
  const { data: n } = await sb.rpc('claim_notification_push', { p_id: id });
  if (!n || !n.id) return;

  const { data: devices } = await sb
    .from('user_devices').select('id, fcm_token')
    .eq('profile_id', n.recipient_id).is('disabled_at', null);

  if (!devices?.length) {
    await sb.from('notifications').update({ push_status: 'skipped' }).eq('id', n.id);
    return;
  }

  const { count } = await sb
    .from('notifications').select('id', { count: 'exact', head: true })
    .eq('recipient_id', n.recipient_id).is('read_at', null);

  let ok = 0, retry = 0;
  const dead: string[] = [];
  for (const d of devices) {
    const r = await sendOne(d.fcm_token, n, count ?? 1);
    if (r === 'ok') ok++;
    else if (r === 'dead') dead.push(d.id);
    else retry++;
  }

  if (dead.length) {
    await sb.from('user_devices').update({ disabled_at: new Date().toISOString() }).in('id', dead);
  }

  if (ok > 0 || retry === 0) {
    await sb.from('notifications').update({
      push_status: ok > 0 ? 'sent' : 'skipped',
      push_sent_at: new Date().toISOString(),
      push_error: null,
    }).eq('id', n.id);
  } else if (n.push_attempts >= 5) {
    await sb.from('notifications').update({ push_status: 'failed', push_error: 'max attempts' }).eq('id', n.id);
  } else {
    await sb.from('notifications').update({ push_error: 'transient failure, will retry' }).eq('id', n.id);
  }
}

Deno.serve(async req => {
  if (req.headers.get('x-webhook-secret') !== SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.notification_id) {
    await process(body.notification_id);
    return Response.json({ ok: true });
  }
  if (body.sweep) {
    const { data } = await sb
      .from('notifications').select('id')
      .eq('push_status', 'pending').lt('push_attempts', 5)
      .lt('created_at', new Date(Date.now() - 60_000).toISOString())
      .order('created_at').limit(50);
    for (const row of data ?? []) await process(row.id);
    return Response.json({ ok: true, swept: data?.length ?? 0 });
  }
  return new Response('bad request', { status: 400 });
});
