-- 0003_settings.sql
insert into public.app_settings (key, value, description, is_public) values
('pricing', jsonb_build_object(
   'term_base_cents',               50000,
   'registration_fee_cents',         3000,
   'gst_rate',                       0.10,
   'individual_class_cents',         5000,
   'assessment_cents',               5000,
   'registration_fee_every_term',    true),
 'TODO: confirm with client — individual class & assessment price assumed $50; registration fee assumed every term; GST charged on top.', false),

('term_rules', jsonb_build_object(
   'credits',                   10,
   'weeks',                     10,
   'expiry_warning_weeks',       2,
   'cancellation_window_hours', 24,
   'hold_hours',                72),
 'TODO: confirm with client — cancellation window; seat-hold length for unverified individual-class payments.', false),

('business', jsonb_build_object(
   'name',               'Fairybread & Fractions',
   'contact_name',       'Therese Howard',
   'timezone',           'Australia/Sydney',
   'current_term_label', 'Term 4, 2026'),
 'current_term_label is the business-calendar label used on payments/reports. Bank + contact details moved to `public_info` (migration 0012b).', false),

('assessment_booking', jsonb_build_object(
   'slots',        jsonb_build_array('15:30','16:30','17:00'),
   'weekdays',     jsonb_build_array(1,2,3,4,5),
   'lead_days',    2,
   'horizon_days', 42),
 'TODO: confirm with client — which days/slots parents can book assessments.', false),

('session_generation', jsonb_build_object('weeks_ahead', 10), 'How far ahead class_sessions are generated.', false);
-- `public_info` (bank + contact, anon-readable) and `shop` settings are inserted by migration 0012b.
