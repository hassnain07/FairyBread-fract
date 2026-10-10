-- 0017_fix_admin_conversations.sql
-- Admin should only see parent_staff and teacher_staff conversations,
-- not private parent_teacher conversations.

create or replace function public.get_conversations()
returns table (id uuid, kind public.conversation_kind, family_id uuid, teacher_id uuid, family_name text, teacher_name text,
               last_message_preview text, last_message_at timestamptz, unread_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.family_id, c.teacher_id, f.parent_name, t.name, c.last_message_preview, c.last_message_at,
         case when me.party is null then 0::bigint else (
           select count(*) from public.messages m
            where m.conversation_id = c.id
              and m.created_at > coalesce((select cr.last_read_at from public.conversation_reads cr
                                            where cr.conversation_id = c.id and cr.party = me.party), '-infinity'::timestamptz)
              and m.sender_role <> me.sender) end
  from public.conversations c
  left join public.families f on f.id = c.family_id
  left join public.teachers t on t.id = c.teacher_id
  cross join lateral (select
      case when private.is_admin() and c.kind in ('parent_staff','teacher_staff') then 'staff'::public.participant_kind
           when private.my_family_id() is not null and c.family_id = private.my_family_id() then 'family'::public.participant_kind
           when private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id() then 'teacher'::public.participant_kind end as party,
      case when private.is_admin() and c.kind in ('parent_staff','teacher_staff') then 'admin'::public.message_sender_role
           when private.my_family_id() is not null and c.family_id = private.my_family_id() then 'parent'::public.message_sender_role
           when private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id() then 'teacher'::public.message_sender_role end as sender) me
  where
    -- Admin: only parent_staff and teacher_staff (not private parent_teacher conversations)
    (private.is_admin() and c.kind in ('parent_staff', 'teacher_staff'))
    -- Parent: their own family conversations (all kinds)
    or (private.my_family_id() is not null and c.family_id = private.my_family_id())
    -- Teacher: their own teacher conversations (all kinds)
    or (private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id())
  order by c.last_message_at desc nulls last
$$;
