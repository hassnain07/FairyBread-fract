-- 0022_subject_assessments.sql
-- Replace the explicit child+teacher selection for term assessments with a
-- subject-based flow: admin picks a subject (program), date and time.
-- The RPC resolves the teacher from the active class for that program,
-- creates one assessment per enrolled child in that subject, and notifies
-- the teacher and each family.

create or replace function public.admin_create_subject_assessments(
  p_program_id  uuid,
  p_date        date,
  p_time        time
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_program   public.programs;
  v_class     public.classes;
  v_teacher   public.teachers;
  v_child     record;
  v_a         public.assessments;
  v_count     int := 0;
  v_ids       uuid[] := '{}';
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_date is null or p_time is null then raise exception 'invalid_input'; end if;
  if p_date < private.local_today() then raise exception 'invalid_input'; end if;

  -- Resolve program
  select * into v_program from public.programs where id = p_program_id;
  if not found then raise exception 'invalid_input'; end if;

  -- Resolve the active class for this program (most recently created active one)
  select * into v_class
    from public.classes
   where program_id = p_program_id and is_active = true
   order by created_at desc
   limit 1;
  if not found then raise exception 'no_class_for_subject'; end if;

  -- Resolve the teacher
  select * into v_teacher from public.teachers where id = v_class.teacher_id;
  if not found then raise exception 'invalid_input'; end if;

  -- Create one assessment per enrolled child booked into this subject's class
  for v_child in
    select distinct ch.id as child_id, ch.family_id, ch.given_name, ch.name as child_name
      from public.class_bookings b
      join public.class_sessions s  on s.id  = b.class_session_id
      join public.children ch       on ch.id = b.child_id
     where s.class_id = v_class.id
       and b.status   = 'confirmed'
       and ch.enrolled_at is not null
       and ch.archived_at is null
       -- skip if an assessment already exists for this child on this date
       and not exists (
         select 1 from public.assessments a2
          where a2.child_id        = ch.id
            and a2.scheduled_date  = p_date
            and a2.status not in ('cancelled')
       )
  loop
    insert into public.assessments
      (family_id, child_id, teacher_id, class_id, scheduled_date, scheduled_time, status, created_by)
    values
      (v_child.family_id, v_child.child_id, v_teacher.id, v_class.id,
       p_date, p_time, 'scheduled', v_uid)
    returning * into v_a;

    v_ids   := v_ids || v_a.id;
    v_count := v_count + 1;

    -- Notify the family
    perform private.notify_family(
      v_child.family_id,
      'assessment_confirmed',
      'Assessment scheduled',
      format('%s has a %s assessment on %s at %s.',
             v_child.given_name,
             v_program.name,
             to_char(p_date, 'FMDay FMDD FMMonth YYYY'),
             to_char(p_time, 'FMHH12:MI AM')),
      '/parent/messages',
      jsonb_build_object('assessment_id', v_a.id)
    );
  end loop;

  -- Notify the teacher once (summary)
  if v_count > 0 then
    perform private.notify_teacher(
      v_teacher.id,
      'assessment_confirmed',
      'Term assessments scheduled',
      format('%s %s assessment%s scheduled for %s at %s.',
             v_count,
             v_program.name,
             case when v_count = 1 then '' else 's' end,
             to_char(p_date, 'FMDay FMDD FMMonth YYYY'),
             to_char(p_time, 'FMHH12:MI AM')),
      '/teacher/assessments',
      jsonb_build_object('program_id', p_program_id, 'date', p_date, 'count', v_count)
    );
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'assessment.bulk_create', 'program', p_program_id::text,
          jsonb_build_object('date', p_date, 'time', p_time, 'teacher_id', v_teacher.id, 'count', v_count));

  return jsonb_build_object(
    'count',      v_count,
    'teacher_id', v_teacher.id,
    'teacher',    v_teacher.name,
    'program',    v_program.name,
    'ids',        v_ids
  );
end $$;

grant execute on function public.admin_create_subject_assessments(uuid, date, time) to authenticated;
