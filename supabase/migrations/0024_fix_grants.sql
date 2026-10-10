-- 0024_fix_grants.sql
-- Re-apply grants that were missing or added after 0009_grants.sql.

-- classes: re-grant insert/update including school_term_id column added in 0018
grant insert (program_id, teacher_id, day_of_week, start_time, duration_minutes, capacity, is_active, created_by, school_term_id) on public.classes to authenticated;
grant update (program_id, teacher_id, day_of_week, start_time, duration_minutes, capacity, is_active, school_term_id) on public.classes to authenticated;

-- school_terms table added in 0018
grant select on public.school_terms to authenticated;
grant insert (label, start_date, end_date, is_active, created_by) on public.school_terms to authenticated;
grant update (label, start_date, end_date, is_active) on public.school_terms to authenticated;

-- term_reminders_sent
grant select on public.term_reminders_sent to authenticated;

-- RPCs added after 0009
grant execute on function
  public.admin_create_school_term(text, date, date),
  public.admin_create_term_assessment(uuid, uuid, date, time, uuid),
  public.admin_create_subject_assessments(uuid, date, time)
  to authenticated;
