-- 0014_admin_invite_staff.sql
-- Replaces the missing admin-invite-user Edge Function.
-- Creates an auth user + profile + teacher row entirely inside the DB.
-- Only callable by admins (security definer, checks private.is_admin()).

create or replace function public.admin_invite_staff(
  p_email     text,
  p_full_name text,
  p_role      public.user_role,   -- 'teacher' | 'admin'
  p_subjects  text[]  default '{}',
  p_color     text    default 'pink',
  p_password  text    default null  -- optional; if null a random one is set (user must reset)
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := gen_random_uuid();
  v_pwd    text := coalesce(p_password, extensions.encode(extensions.gen_random_bytes(18), 'base64'));
  v_fam    uuid;
  v_tid    uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  p_email := lower(btrim(p_email));
  if p_email = '' or p_email not like '%@%' then
    raise exception 'invalid_input';
  end if;
  if btrim(p_full_name) = '' then
    raise exception 'invalid_input';
  end if;
  if p_role not in ('teacher', 'admin') then
    raise exception 'invalid_input';
  end if;

  -- Create the auth user (email pre-confirmed so they can log in immediately)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated',
    p_email,
    extensions.crypt(v_pwd, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', '["email"]'::jsonb, 'role', p_role::text),
    jsonb_build_object(
      'first_name', split_part(btrim(p_full_name), ' ', 1),
      'last_name',  nullif(btrim(substring(btrim(p_full_name) from position(' ' in btrim(p_full_name)) + 1)), '')
    ),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, v_uid::text, 'email',
    jsonb_build_object('sub', v_uid::text, 'email', p_email, 'email_verified', true),
    now(), now(), now()
  );

  -- The on_auth_user_created trigger fires and creates a profile (role=parent) + family.
  -- Promote the profile and remove the auto-created family.
  select family_id into v_fam
    from public.family_members where profile_id = v_uid;

  delete from public.families where id = v_fam;

  update public.profiles
     set role = p_role, full_name = btrim(p_full_name)
   where id = v_uid;

  -- Create the teacher row
  insert into public.teachers (profile_id, name, subjects, color)
  values (v_uid, btrim(p_full_name), p_subjects, p_color)
  returning id into v_tid;

  return jsonb_build_object(
    'user_id',    v_uid,
    'teacher_id', v_tid,
    'email',      p_email,
    'temp_password', v_pwd
  );
end $$;

-- Grant to authenticated (RPC itself checks is_admin())
grant execute on function public.admin_invite_staff(text, text, public.user_role, text[], text, text)
  to authenticated;
