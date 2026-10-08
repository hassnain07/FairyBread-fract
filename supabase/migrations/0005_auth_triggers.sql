-- 0005_auth_triggers.sql

-- Every new auth user becomes a PARENT with its own family.
-- Role is NEVER read from user metadata (user_metadata is user-editable).
-- Staff accounts are promoted by the admin-invite Edge Function (service role).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name   text;
  v_phone  text := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_family uuid;
begin
  v_name := coalesce(
    nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name','') || ' ' || coalesce(new.raw_user_meta_data->>'last_name','')), ''),
    split_part(new.email, '@', 1));

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, 'parent', v_name, new.email, v_phone);

  insert into public.families (parent_name, email, phone)
  values (v_name, new.email, v_phone) returning id into v_family;

  insert into public.family_members (family_id, profile_id, relationship, is_primary)
  values (v_family, new.id, 'parent', true);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function private.handle_new_user();

-- On email confirmation: keep profile email in sync; if an admin pre-created a family with this
-- (now VERIFIED) email and it has no login yet, attach the user to it and drop the empty auto-created one.
create or replace function private.handle_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_own uuid; v_target uuid;
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;

  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and (select role from public.profiles where id = new.id) = 'parent' then
    select family_id into v_own from public.family_members where profile_id = new.id;
    select f.id into v_target from public.families f
     where lower(f.email) = lower(new.email)
       and f.id is distinct from v_own
       and not exists (select 1 from public.family_members m where m.family_id = f.id)
     order by f.created_at limit 1;

    if v_target is not null and v_own is not null
       and not exists (select 1 from public.children where family_id = v_own)
       and not exists (select 1 from public.terms    where family_id = v_own)
       and not exists (select 1 from public.payments where family_id = v_own) then
      update public.family_members set family_id = v_target, is_primary = true where profile_id = new.id;
      delete from public.families where id = v_own;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated
  after update on auth.users for each row execute function private.handle_user_updated();

-- One round-trip "who am I" used by the frontend AuthProvider.
create or replace function public.get_my_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',         p.id,
    'email',      p.email,
    'full_name',  p.full_name,
    'role',       p.role,
    'family_id',  (select fm.family_id from public.family_members fm where fm.profile_id = p.id limit 1),
    'teacher_id', (select t.id from public.teachers t where t.profile_id = p.id and t.is_active limit 1))
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;
