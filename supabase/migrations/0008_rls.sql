-- 0008_rls.sql
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','families','family_members','teachers','programs','children','enrolments','app_settings','documents','closures',
    'classes','class_rates','class_sessions','payments','terms','term_credit_ledger','term_reminders_sent','class_bookings',
    'individual_class_purchases','assessments','student_reports','attendance','conversations','conversation_reads','messages',
    'notifications','user_devices','notification_preferences','audit_log']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- ── Identity ──────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy families_select on public.families for select to authenticated
  using (id = (select private.my_family_id()) or (select private.is_admin()));
create policy families_update on public.families for update to authenticated
  using (id = (select private.my_family_id()) or (select private.is_admin()))
  with check (id = (select private.my_family_id()) or (select private.is_admin()));
create policy families_insert_admin on public.families for insert to authenticated
  with check ((select private.is_admin()));

create policy family_members_select on public.family_members for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_admin()));

create policy teachers_select on public.teachers for select to authenticated using (true);
create policy teachers_admin_write on public.teachers for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy programs_select on public.programs for select to authenticated using (true);
create policy programs_admin_write on public.programs for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ── Children / enrolment ─────────────────────────────────────────────────────
create policy children_select on public.children for select to authenticated using (
  family_id = (select private.my_family_id()) or (select private.is_admin()) or private.teacher_has_child(id));
create policy children_insert on public.children for insert to authenticated
  with check (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy children_update on public.children for update to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()))
  with check (family_id = (select private.my_family_id()) or (select private.is_admin()));

create policy enrolments_select on public.enrolments for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));

-- ── Settings / content ───────────────────────────────────────────────────────
create policy settings_select_anon on public.app_settings for select to anon using (is_public);
create policy settings_select_auth on public.app_settings for select to authenticated using (true);
create policy settings_admin_write on public.app_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy documents_select on public.documents for select to anon, authenticated using (true);
create policy documents_admin_write on public.documents for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy closures_select on public.closures for select to authenticated using (true);
create policy closures_admin_write on public.closures for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ── Classes ───────────────────────────────────────────────────────────────────
create policy classes_select on public.classes for select to authenticated
  using (is_active or (select private.is_admin()) or teacher_id = (select private.my_teacher_id()));
create policy classes_insert on public.classes for insert to authenticated
  with check ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()));
create policy classes_update on public.classes for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()))
  with check ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()));

create policy class_rates_all on public.class_rates for all to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select private.my_teacher_id())))
  with check ((select private.is_admin()) or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select private.my_teacher_id())));

create policy class_sessions_select on public.class_sessions for select to authenticated using (true);

-- ── Money & credits ──────────────────────────────────────────────────────────
create policy payments_select on public.payments for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy terms_select on public.terms for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy ledger_select on public.term_credit_ledger for select to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.terms t where t.id = term_id and t.family_id = (select private.my_family_id())));
create policy purchases_select on public.individual_class_purchases for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));

create policy bookings_select on public.class_bookings for select to authenticated using (
  family_id = (select private.my_family_id()) or (select private.is_admin()) or private.teacher_owns_session(class_session_id));

-- ── Assessments / reports / attendance ───────────────────────────────────────
create policy assessments_select on public.assessments for select to authenticated using (
  family_id = (select private.my_family_id()) or (select private.is_admin()) or teacher_id = (select private.my_teacher_id()));
create policy assessments_insert on public.assessments for insert to authenticated with check (
  (select private.is_admin()) or (teacher_id = (select private.my_teacher_id()) and private.teacher_has_child(child_id)));
create policy assessments_update on public.assessments for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()))
  with check ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()));

create policy reports_select on public.student_reports for select to authenticated using (
  (select private.is_admin()) or teacher_id = (select private.my_teacher_id())
  or (status = 'published' and child_id in (select c.id from public.children c where c.family_id = (select private.my_family_id()))));
create policy reports_insert on public.student_reports for insert to authenticated with check (
  (select private.is_admin()) or (teacher_id = (select private.my_teacher_id()) and private.teacher_has_child(child_id)));
create policy reports_update on public.student_reports for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()))
  with check ((select private.is_admin()) or (teacher_id = (select private.my_teacher_id()) and private.teacher_has_child(child_id)));

create policy attendance_select on public.attendance for select to authenticated using (
  (select private.is_admin()) or private.teacher_owns_session(class_session_id)
  or child_id in (select c.id from public.children c where c.family_id = (select private.my_family_id())));

-- ── Messaging ─────────────────────────────────────────────────────────────────
create policy conversations_select on public.conversations for select to authenticated using (
  (select private.is_admin())
  or (family_id  is not null and family_id  = (select private.my_family_id()))
  or (teacher_id is not null and teacher_id = (select private.my_teacher_id())));
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));

-- ── Notifications / devices / prefs ──────────────────────────────────────────
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy devices_select on public.user_devices for select to authenticated using (profile_id = (select auth.uid()));
create policy devices_delete on public.user_devices for delete to authenticated using (profile_id = (select auth.uid()));
create policy prefs_all on public.notification_preferences for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy audit_select on public.audit_log for select to authenticated using ((select private.is_admin()));
