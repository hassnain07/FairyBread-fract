-- supabase/dev_reset.sql   (DEV PROJECT ONLY — NEVER run on production)
-- Wipes every family, class, payment, order, notification and auth user.
-- Keeps the schema, functions, settings, categories and documents.
-- After running this, run seed.sql to restore the demo world.

begin;
truncate table
  public.families, public.teachers, public.programs, public.closures,
  public.shop_products, public.rate_limit_hits, public.audit_log, public.notifications
  restart identity cascade;

update public.app_settings set updated_by = null;
update public.documents    set updated_by = null;
delete from auth.users;

alter sequence public.family_ref_seq restart with 1001;
alter sequence public.shop_order_seq restart with 1001;
commit;
