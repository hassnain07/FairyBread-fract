-- 0021_fix_shop_products_storage_rls.sql
-- Replace private.is_admin() in storage policies with an inline profiles lookup.
-- Storage RLS evaluates policies under the authenticated role; the private schema
-- function call can silently fail in that context. An inline subquery is more reliable.

drop policy if exists shop_products_img_insert on storage.objects;
drop policy if exists shop_products_img_update on storage.objects;
drop policy if exists shop_products_img_delete on storage.objects;

create policy shop_products_img_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shop-products'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and is_active
    )
  );

create policy shop_products_img_update on storage.objects for update to authenticated
  using (
    bucket_id = 'shop-products'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and is_active
    )
  )
  with check (
    bucket_id = 'shop-products'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and is_active
    )
  );

create policy shop_products_img_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'shop-products'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and is_active
    )
  );
