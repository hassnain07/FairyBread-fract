-- 0009_grants.sql

-- 1) Start from nothing.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon;

-- 2) Table reads (RLS filters rows).
grant select on public.profiles, public.families, public.family_members, public.teachers, public.programs,
  public.children, public.enrolments, public.app_settings, public.documents, public.closures,
  public.classes, public.class_rates, public.class_sessions, public.payments, public.terms, public.term_credit_ledger,
  public.class_bookings, public.individual_class_purchases, public.assessments, public.student_reports, public.attendance,
  public.conversations, public.messages, public.notifications, public.user_devices, public.notification_preferences,
  public.audit_log
  to authenticated;
grant select on public.app_settings, public.documents to anon;

-- 3) Column-restricted writes.
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant update (parent_name, phone, secondary_phone, address, relationship, emergency_name,
              emergency_relationship, emergency_phone, referral_source) on public.families to authenticated;
grant insert (parent_name, email, phone) on public.families to authenticated;
grant insert (family_id, given_name, family_name, preferred_name, year_level, school, date_of_birth, concern, subjects,
              preferred_days, goals, notes, preferred_teacher_id, sessions_per_week) on public.children to authenticated;
grant update (given_name, family_name, preferred_name, year_level, school, date_of_birth, concern, subjects,
              preferred_days, goals, notes, preferred_teacher_id, sessions_per_week, archived_at) on public.children to authenticated;
grant insert, update on public.teachers, public.programs, public.closures to authenticated;
grant delete on public.closures to authenticated;
grant insert (key, storage_path, version, original_filename, updated_by, updated_at), update on public.documents to authenticated;
grant update (value, updated_by, updated_at) on public.app_settings to authenticated;

grant insert (program_id, teacher_id, day_of_week, start_time, duration_minutes, capacity, is_active, created_by) on public.classes to authenticated;
grant update (program_id, teacher_id, day_of_week, start_time, duration_minutes, capacity, is_active) on public.classes to authenticated;
grant insert, update on public.class_rates to authenticated;

grant insert (family_id, child_id, teacher_id, class_id, scheduled_date, scheduled_time, status, notes, created_by) on public.assessments to authenticated;
grant update (teacher_id, scheduled_date, scheduled_time, status, notes) on public.assessments to authenticated;

grant insert (child_id, teacher_id, term_label, overall, subjects, strengths, areas, note, status) on public.student_reports to authenticated;
grant update (overall, subjects, strengths, areas, note, status) on public.student_reports to authenticated;

grant update (read_at) on public.notifications to authenticated;
grant delete on public.user_devices to authenticated;
grant insert, update on public.notification_preferences to authenticated;

-- 4) RPCs callable by signed-in users.
grant execute on function
  public.get_my_context(), public.quote_price(public.payment_type, uuid), public.get_family_gating(uuid),
  public.complete_enrolment(uuid, jsonb, jsonb, text, text, boolean, boolean, boolean),
  public.book_class_session(uuid, uuid), public.join_waitlist(uuid, uuid), public.cancel_booking(uuid, boolean),
  public.submit_payment(uuid, uuid, public.payment_type, text, text, uuid, uuid, date, time),
  public.verify_payment(uuid, text, text), public.admin_record_payment(uuid, public.payment_type, uuid, uuid, text),
  public.admin_adjust_credits(uuid, int, text), public.cancel_session(uuid, text), public.deactivate_class(uuid, boolean),
  public.save_attendance(uuid, jsonb), public.admin_create_family(text, text, text), public.admin_mark_enrolled(uuid, text),
  public.start_conversation(public.conversation_kind, uuid, uuid), public.send_message(uuid, text, boolean),
  public.get_conversations(), public.mark_conversation_read(uuid), public.mark_all_notifications_read(),
  public.register_device(text, public.device_platform, text, text), public.unregister_device(text),
  public.admin_dashboard_stats()
  to authenticated;

-- 5) Private helpers used inside RLS policies.
grant execute on function
  private.is_admin(), private.user_role(), private.my_family_id(), private.my_teacher_id(), private.is_family_member(uuid),
  private.teacher_owns_session(uuid), private.teacher_has_child(uuid), private.teacher_teaches_family(uuid, uuid),
  private.local_today()
  to authenticated;

-- 6) Edge Function (service role) only.
grant execute on function public.claim_notification_push(uuid) to service_role;
