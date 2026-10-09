// supabase/functions/shop-guest-checkout/index.ts
// Deploy via Dashboard → Edge Functions → Via Editor. Verify JWT: OFF.
// Secrets: IP_HASH_SALT (required), TURNSTILE_SECRET (optional), RESEND_API_KEY + MAIL_FROM (optional email).
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);
const SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const TURNSTILE = Deno.env.get('TURNSTILE_SECRET');
const RESEND = Deno.env.get('RESEND_API_KEY');
const MAIL_FROM = Deno.env.get('MAIL_FROM');
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z_]{3,40}$/;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function ipHash(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + ip));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function captchaOk(token?: string) {
  if (!TURNSTILE) return true;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: TURNSTILE, response: token }),
  });
  return (await r.json()).success === true;
}

async function emailConfirmation(orderId: string) {
  if (!RESEND || !MAIL_FROM) return;
  const { data: o } = await sb.from('shop_orders').select('*, items:shop_order_items(*)').eq('id', orderId).single();
  const { data: pub } = await sb.from('app_settings').select('value').eq('key', 'public_info').single();
  if (!o?.delivery_email) return;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const rows = o.items.map((i: any) =>
    `<tr><td>${esc(i.title)}</td><td>${i.quantity}</td><td>${money(i.unit_price_cents * i.quantity)}</td></tr>`
  ).join('');
  const html = `<h2>Thanks, ${esc(o.delivery_name)}!</h2>
    <p>We received order <b>${esc(o.order_number)}</b>.</p>
    <table cellpadding="6">${rows}</table>
    <p><b>Total ${money(o.total_cents)}</b></p>
    <p>${o.payment_method === 'advance' ? 'We will verify your bank transfer and email you when your order is on its way.' : 'You will pay cash on delivery.'}</p>
    <p>Questions? ${esc((pub?.value as any)?.contact_email ?? '')}</p>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: o.delivery_email, subject: `Order ${o.order_number} received`, html }),
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (Number(req.headers.get('content-length') ?? 0) > 50_000) return json({ error: 'invalid_input' }, 413);

  const body = await req.json().catch(() => null);
  if (!body || typeof body.orderId !== 'string' || !UUID.test(body.orderId)) return json({ error: 'invalid_input' }, 400);
  const hash = await ipHash(req);

  // ── 1) signed upload URL for bank-transfer receipt ─────────────────────────
  if (body.action === 'upload_url') {
    const { data: ok } = await sb.rpc('check_rate_limit', { p_bucket: 'guest_upload', p_key: hash, p_max: 10, p_window_seconds: 3600 });
    if (!ok) return json({ error: 'rate_limited' }, 429);
    if (!MIME.includes(body.contentType)) return json({ error: 'invalid_input' }, 400);
    const safe = String(body.filename ?? 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = `guest/${body.orderId}/${safe}`;
    const { data, error } = await sb.storage.from('shop-receipts').createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'upload_failed' }, 500);
    return json({ path: data.path, token: data.token });
  }

  // ── 2) place the order ─────────────────────────────────────────────────────
  if (body.action === 'place') {
    if (!(await captchaOk(body.captchaToken))) return json({ error: 'captcha_failed' }, 400);
    const { data: ok } = await sb.rpc('check_rate_limit', { p_bucket: 'guest_order', p_key: hash, p_max: 8, p_window_seconds: 3600 });
    if (!ok) return json({ error: 'rate_limited' }, 429);
    if (!Array.isArray(body.items) || body.items.length > 50) return json({ error: 'invalid_input' }, 400);

    const { data, error } = await sb.rpc('place_guest_order', {
      p_id: body.orderId,
      p_items: body.items.map((i: any) => ({ product_id: i.productId, quantity: i.quantity })),
      p_method: body.paymentMethod,
      p_delivery: body.delivery,
      p_receipt_path: body.receiptPath ?? null,
      p_receipt_filename: body.receiptFilename ?? null,
      p_ip_hash: hash,
    });
    if (error) {
      const code = CODE.test(error.message) ? error.message : 'unknown';
      return json({ error: code }, code === 'rate_limited' ? 429 : 400);
    }
    try { await emailConfirmation(body.orderId); } catch (e) { console.error('confirmation email failed', e); }
    return json({ order: data });
  }

  return json({ error: 'invalid_input' }, 400);
});
