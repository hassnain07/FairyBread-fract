-- 0010_views_storage_realtime.sql

-- ── Views ─────────────────────────────────────────────────────────────────────
create view public.v_class_catalog with (security_invoker = true) as
select c.id, c.program_id, pr.name as subject, pr.color as program_color,
       c.teacher_id, t.name as teacher_name, t.initials as teacher_initials, t.color as teacher_color,
       c.day_of_week, c.start_time, c.duration_minutes, c.capacity, c.is_active,
       ns.id as next_session_id, ns.starts_at as next_session_at, coalesce(ns.booked_count, 0) as next_booked_count
from public.classes c
join public.programs pr on pr.id = c.program_id
join public.teachers t  on t.id  = c.teacher_id
left join lateral (select s.id, s.starts_at, s.booked_count from public.class_sessions s
                    where s.class_id = c.id and s.status = 'scheduled' and s.starts_at > now()
                    order by s.starts_at limit 1) ns on true;

create view public.v_family_summary with (security_invoker = true) as
select f.id as family_id, f.reference_code, f.parent_name, f.email, f.phone,
  exists (select 1 from public.family_members m where m.family_id = f.id) as has_portal_access,
  (select count(*) from public.children c where c.family_id = f.id and c.archived_at is null) as child_count,
  case when not exists (select 1 from public.terms t where t.family_id = f.id) then 'NO_TERM_EVER'
       when exists (select 1 from public.terms t where t.family_id = f.id and t.end_date > private.local_today()) then 'ACTIVE_TERM'
       else 'TERM_EXPIRED' end as gating_state,
  (select t.classes_remaining from public.terms t where t.family_id = f.id and t.start_date <= private.local_today()
     and t.end_date > private.local_today() order by t.start_date desc limit 1) as credits_remaining,
  (select t.end_date from public.terms t where t.family_id = f.id and t.start_date <= private.local_today()
     and t.end_date > private.local_today() order by t.start_date desc limit 1) as term_end_date,
  (select p.status from public.payments p where p.family_id = f.id order by p.created_at desc limit 1) as last_payment_status
from public.families f;

create view public.v_program_stats with (security_invoker = true) as
select pr.id, pr.name, pr.description, pr.color, pr.is_active,
  (select count(distinct b.child_id) from public.class_bookings b
     join public.class_sessions s on s.id = b.class_session_id join public.classes c on c.id = s.class_id
    where c.program_id = pr.id and b.status = 'confirmed' and s.session_date >= private.local_today() - 70) as students
from public.programs pr;

grant select on public.v_class_catalog, public.v_family_summary, public.v_program_stats to authenticated;

-- Monitoring only — must always return 0 rows.
create view public.v_counter_drift as
select 'session_booked_count' as kind, s.id::text as id, s.booked_count as stored, count(b.id)::int as actual
  from public.class_sessions s
  left join public.class_bookings b on b.class_session_id = s.id and b.status in ('confirmed', 'pending_payment')
 group by s.id having s.booked_count <> count(b.id)
union all
select 'term_classes_booked', t.id::text, t.classes_booked,
       (select count(*)::int from public.class_bookings b where b.term_id = t.id and b.credit_consumed and b.status = 'confirmed')
  from public.terms t
 where t.classes_booked <> (select count(*) from public.class_bookings b where b.term_id = t.id and b.credit_consumed and b.status = 'confirmed')
union all
select 'term_ledger_sum', t.id::text, t.classes_remaining, coalesce((select sum(l.delta)::int from public.term_credit_ledger l where l.term_id = t.id), 0)
  from public.terms t
 where t.classes_remaining <> coalesce((select sum(l.delta) from public.term_credit_ledger l where l.term_id = t.id), 0);

-- ── Storage ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('payment-proofs', 'payment-proofs', false, 10485760,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('documents',      'documents',      true,  10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select private.my_family_id())::text);
create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
         and ((storage.foldername(name))[1] = (select private.my_family_id())::text or (select private.is_admin())));

create policy documents_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));

-- ── Realtime ──────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages, public.notifications;
