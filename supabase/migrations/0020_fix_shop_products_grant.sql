-- 0020_fix_shop_products_grant.sql
-- upsert requires INSERT/UPDATE on the full row (id is needed as the conflict target).
-- The RLS policy already restricts writes to admins only.

grant insert, update on public.shop_products to authenticated;
