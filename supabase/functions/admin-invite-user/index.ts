import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'forbidden' }, 403);

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin  = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // who is calling? only an admin may invite
  const { data: ctx } = await caller.rpc('get_my_context');
  if (ctx?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const fullName = String(body?.fullName ?? '').trim();
  const role = body?.role;
  const subjects = Array.isArray(body?.subjects) ? body.subjects : [];
  const color = body?.color ?? 'pink';
  if (!['teacher', 'admin'].includes(role) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !fullName)
    return json({ error: 'invalid_input' }, 400);

  const [first, ...rest] = fullName.split(' ');

  // Check if user already exists in auth
  const { data: existingList } = await admin.auth.admin.listUsers();
  const existingUser = existingList?.users?.find((u: any) => u.email === email);

  let uid: string;
  if (existingUser) {
    // User already exists — keep their current role, just add teacher row
    uid = existingUser.id;
  } else {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: first, last_name: rest.join(' ') },
      redirectTo: `${Deno.env.get('APP_URL') ?? ''}/reset-password`,
    });
    if (error || !invited?.user) return json({ error: error?.message ?? 'invite_failed' }, 400);
    uid = invited.user.id;
    // New user — set their role and clean up the parent family the signup trigger created
    const { data: fm } = await admin.from('family_members').select('family_id').eq('profile_id', uid).maybeSingle();
    if (fm) await admin.from('families').delete().eq('id', fm.family_id);
    const p = await admin.from('profiles').update({ role, full_name: fullName }).eq('id', uid);
    if (p.error) return json({ error: 'profile_update_failed' }, 500);
  }

  // Upsert teacher row — explicitly active
  const t = await admin.from('teachers').upsert(
    { profile_id: uid, name: fullName, subjects, color, is_active: true },
    { onConflict: 'profile_id' }
  );
  if (t.error) return json({ error: 'teacher_insert_failed' }, 500);

  await admin.from('audit_log').insert({ actor_id: ctx.id, action: 'staff.invite', entity: 'profile', entity_id: uid, details: { role, email } });
  return json({ ok: true, invited: !existingUser });
});