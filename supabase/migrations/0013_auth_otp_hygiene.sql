-- 0013_auth_otp_hygiene.sql
create or replace function private.purge_unverified_users(p_older_than interval default interval '7 days') returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select u.id from auth.users u
     where u.email_confirmed_at is null
       and u.created_at < now() - p_older_than
       and not exists (select 1 from public.profiles p where p.id = u.id and p.role <> 'parent')
  loop
    begin
      delete from public.families f
       where f.id in (select fm.family_id from public.family_members fm where fm.profile_id = r.id)
         and not exists (select 1 from public.children c where c.family_id = f.id)
         and not exists (select 1 from public.terms t where t.family_id = f.id)
         and not exists (select 1 from public.payments p where p.family_id = f.id)
         and not exists (select 1 from public.shop_orders o where o.family_id = f.id);
      delete from auth.users where id = r.id;
      v_n := v_n + 1;
    exception when others then
      continue;
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function private.purge_unverified_users(interval) from public, anon, authenticated;

select cron.schedule('fb-purge-unverified', '0 18 * * 0', $$select private.purge_unverified_users()$$);
