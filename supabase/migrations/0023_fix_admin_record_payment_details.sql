-- 0023_fix_admin_record_payment_details.sql
-- Fix: admin_record_payment passes NULL for details on term payments,
-- violating the NOT NULL constraint on payments.details.

create or replace function public.admin_record_payment(
  p_family_id uuid, p_type public.payment_type, p_child_id uuid default null,
  p_class_session_id uuid default null, p_note text default null
) returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_id uuid := gen_random_uuid(); v_fam public.families;
  v_price record; v_pay public.payments;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type = 'assessment' then raise exception 'invalid_input'; end if;
  select * into v_fam from public.families where id = p_family_id;
  if not found then raise exception 'invalid_input'; end if;
  select * into v_price from private.calc_price(p_type, p_family_id);

  insert into public.payments
    (id, family_id, type, status, amount_cents, gst_cents, reference, term_label, child_id, class_session_id,
     recorded_by_admin, submitted_by, reviewed_by, reviewed_at, review_note, details)
  values
    (v_id, p_family_id, p_type, 'paid', v_price.amount_cents, v_price.gst_cents,
     v_fam.reference_code || '-' || case p_type when 'term' then 'TERM' else 'CLASS' end,
     case when p_type = 'term' then private.setting('business')->>'current_term_label' end,
     p_child_id, p_class_session_id, true, v_uid, v_uid, now(), p_note,
     coalesce(
       (select jsonb_build_object('child_name', ch.name) from public.children ch where ch.id = p_child_id),
       '{}'::jsonb
     ))
  returning * into v_pay;

  if p_type = 'individual_class' then
    perform private.hold_seat(p_family_id, p_child_id, p_class_session_id, v_id, v_uid);
  end if;
  perform private.apply_paid_payment(v_id, v_uid);

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'payment.admin_record', 'payment', v_id::text,
          jsonb_build_object('type', p_type, 'family_id', p_family_id, 'note', p_note));
  return v_pay;
end $$;
