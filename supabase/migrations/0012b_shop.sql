-- 0012b_shop.sql

create type public.shop_order_status   as enum ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled');
create type public.shop_payment_method as enum ('cod', 'advance');
create type public.shop_payment_status as enum ('unpaid', 'pending_verification', 'paid', 'refunded');
create type public.shop_order_source   as enum ('portal', 'guest');

create table public.shop_categories (
  name        text primary key,
  sort_order  int not null default 0
);
insert into public.shop_categories (name, sort_order) values
  ('Workbooks', 1), ('Flash Cards', 2), ('Activity Kits', 3);

create table public.shop_products (
  id                   uuid primary key default gen_random_uuid(),
  category             text not null references public.shop_categories(name) on update cascade,
  title                text not null check (length(btrim(title)) between 1 and 200),
  description          text not null default '',
  details              text not null default '',
  price_cents          int  not null check (price_cents >= 0),
  image_path           text,
  stock_quantity       int  not null default 0 check (stock_quantity >= 0),
  low_stock_threshold  int  not null default 5 check (low_stock_threshold >= 0),
  status               text generated always as (
                         case when stock_quantity <= 0 then 'Out of Stock'
                              when stock_quantity <= low_stock_threshold then 'Low Stock'
                              else 'In Stock' end) stored,
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index shop_products_active_idx on public.shop_products (sort_order, title) where is_active;

create sequence public.shop_order_seq start 1001;

create table public.shop_orders (
  id                   uuid primary key,
  order_number         text not null unique default ('FBO-' || nextval('public.shop_order_seq')),
  source               public.shop_order_source not null,
  family_id            uuid references public.families(id) on delete restrict,
  placed_by            uuid references public.profiles(id) on delete set null,
  customer_name        text not null,
  status               public.shop_order_status not null default 'Pending',
  payment_method       public.shop_payment_method not null,
  payment_status       public.shop_payment_status not null,
  subtotal_cents       int not null check (subtotal_cents >= 0),
  shipping_cents       int not null default 0 check (shipping_cents >= 0),
  total_cents          int generated always as (subtotal_cents + shipping_cents) stored,
  receipt_path         text,
  receipt_filename     text,
  receipt_uploaded_at  timestamptz,
  delivery_name        text not null check (char_length(delivery_name)    between 1 and 120),
  delivery_address     text not null check (char_length(delivery_address) between 1 and 500),
  delivery_phone       text not null check (char_length(delivery_phone)   between 5 and 40),
  delivery_email       text,
  guest_ip_hash        text,
  reviewed_by          uuid references public.profiles(id),
  reviewed_at          timestamptz,
  review_note          text,
  stock_released       boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((source = 'portal' and family_id is not null) or (source = 'guest' and family_id is null)),
  check (source <> 'guest' or (delivery_email is not null and delivery_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  check (payment_method <> 'advance' or receipt_path is not null)
);
create index shop_orders_family_idx  on public.shop_orders (family_id, created_at desc);
create index shop_orders_created_idx on public.shop_orders (created_at desc);
create index shop_orders_pending_idx on public.shop_orders (created_at) where payment_status = 'pending_verification';
create index shop_orders_guest_ip_idx on public.shop_orders (guest_ip_hash, created_at) where guest_ip_hash is not null;

create table public.shop_order_items (
  id                bigint generated always as identity primary key,
  order_id          uuid not null references public.shop_orders(id) on delete cascade,
  product_id        uuid references public.shop_products(id) on delete set null,
  title             text not null,
  unit_price_cents  int  not null check (unit_price_cents >= 0),
  quantity          int  not null check (quantity between 1 and 999)
);
create index shop_order_items_order_idx on public.shop_order_items (order_id);

create table public.rate_limit_hits (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  key         text not null,
  created_at  timestamptz not null default now()
);
create index rate_limit_hits_idx on public.rate_limit_hits (bucket, key, created_at);

create trigger set_updated_at before update on public.shop_products for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.shop_orders   for each row execute function private.set_updated_at();

-- ── Settings ──────────────────────────────────────────────────────────────────
insert into public.app_settings (key, value, description, is_public) values
('public_info', jsonb_build_object(
   'contact_email', 'hello@fairybreadandfractions.com',
   'phone',         '(02) 4000 1234',
   'bank', jsonb_build_object('account_name','Fairybread & Fractions Tutoring','bsb','000 000','account_number','00000000')),
 'Shown to everyone who reaches checkout (including guests). Replace the bank details before go-live.', true),
('shop', jsonb_build_object(
   'cod_enabled',              true,
   'advance_enabled',          true,
   'guest_checkout_enabled',   true,
   'shipping_cents',           0,
   'max_qty_per_line',         20,
   'max_lines',                30,
   'guest_orders_per_ip_hour', 5,
   'advance_hold_days',        3),
 'TODO: confirm with client — shipping fee, COD availability, GST treatment of shop prices (currently: price is final).', true)
on conflict (key) do nothing;

-- New preference category 'orders'
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('new_bookings','cancellations','payments','reports','reminders','messages','announcements','orders'));

-- Updated notif_category to include shop types
create or replace function private.notif_category(p_type public.notification_type) returns text
language sql immutable set search_path = '' as $$
  select case p_type::text
    when 'booking_confirmed'      then 'new_bookings'
    when 'waitlist_spot_open'     then 'new_bookings'
    when 'enrolment_completed'    then 'new_bookings'
    when 'booking_cancelled'      then 'cancellations'
    when 'session_cancelled'      then 'cancellations'
    when 'payment_received'       then 'payments'
    when 'payment_approved'       then 'payments'
    when 'payment_rejected'       then 'payments'
    when 'report_ready'           then 'reports'
    when 'term_expiring'          then 'reminders'
    when 'session_reminder'       then 'reminders'
    when 'assessment_confirmed'   then 'reminders'
    when 'message_received'       then 'messages'
    when 'shop_order_received'    then 'orders'
    when 'shop_payment_approved'  then 'orders'
    when 'shop_payment_rejected'  then 'orders'
    when 'shop_order_update'      then 'orders'
    else 'announcements' end
$$;

-- ── Functions ─────────────────────────────────────────────────────────────────
create or replace function public.check_rate_limit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  select count(*) into v_n from public.rate_limit_hits
   where bucket = p_bucket and key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if v_n >= p_max then return false; end if;
  insert into public.rate_limit_hits (bucket, key) values (p_bucket, p_key);
  return true;
end $$;

create or replace function public.get_shop_products()
returns table (id uuid, category text, title text, description text, details text,
               price_cents int, image_path text, status text, sort_order int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.category, p.title, p.description, p.details, p.price_cents, p.image_path, p.status, p.sort_order
    from public.shop_products p
   where p.is_active
   order by p.sort_order, p.title
$$;

create or replace function private.release_shop_stock(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if (select stock_released from public.shop_orders where id = p_order) then return; end if;
  for i in select product_id, quantity from public.shop_order_items
            where order_id = p_order and product_id is not null order by product_id loop
    update public.shop_products set stock_quantity = stock_quantity + i.quantity where id = i.product_id;
  end loop;
  update public.shop_orders set stock_released = true where id = p_order;
end $$;

create or replace function private.create_shop_order(
  p_id uuid, p_source public.shop_order_source, p_family uuid, p_actor uuid, p_customer_name text,
  p_items jsonb, p_method public.shop_payment_method, p_delivery jsonb,
  p_receipt_path text, p_receipt_filename text, p_ip_hash text
) returns public.shop_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg       jsonb := coalesce(private.setting('shop'), '{}'::jsonb);
  v_max_qty   int   := coalesce((v_cfg->>'max_qty_per_line')::int, 20);
  v_max_lines int   := coalesce((v_cfg->>'max_lines')::int, 30);
  v_ship      int   := coalesce((v_cfg->>'shipping_cents')::int, 0);
  v_name      text  := btrim(coalesce(p_delivery->>'name', ''));
  v_addr      text  := btrim(coalesce(p_delivery->>'address', ''));
  v_phone     text  := btrim(coalesce(p_delivery->>'phone', ''));
  v_email     text  := nullif(btrim(coalesce(p_delivery->>'email', '')), '');
  v_ex        public.shop_orders;
  v_order     public.shop_orders;
  v_norm      jsonb;
  r           record;
  v_subtotal  bigint := 0;
  v_lines     int := 0;
begin
  select * into v_ex from public.shop_orders where id = p_id;
  if found then
    if v_ex.source <> p_source or v_ex.family_id is distinct from p_family then raise exception 'forbidden' using errcode = '42501'; end if;
    return v_ex;
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' then raise exception 'invalid_input'; end if;
  if jsonb_array_length(p_items) not between 1 and v_max_lines then raise exception 'invalid_input'; end if;
  if v_name = '' or char_length(v_name) > 120 or v_addr = '' or char_length(v_addr) > 500
     or char_length(v_phone) not between 5 and 40 then raise exception 'invalid_input'; end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input'; end if;
  if p_source = 'guest' and v_email is null then raise exception 'invalid_input'; end if;

  if p_method = 'cod'     and not coalesce((v_cfg->>'cod_enabled')::boolean,     true) then raise exception 'payment_method_disabled'; end if;
  if p_method = 'advance' and not coalesce((v_cfg->>'advance_enabled')::boolean, true) then raise exception 'payment_method_disabled'; end if;
  if p_method = 'advance' and p_receipt_path is null then raise exception 'proof_missing'; end if;

  select jsonb_agg(jsonb_build_object('product_id', x.pid, 'qty', x.q)) into v_norm
    from (select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int) as q
            from jsonb_array_elements(p_items) e group by 1) x;

  for r in
    select p.id, p.price_cents, p.stock_quantity, p.is_active, x.qty
      from jsonb_to_recordset(v_norm) as x(product_id uuid, qty int)
      join public.shop_products p on p.id = x.product_id
     order by p.id for update of p
  loop
    if not r.is_active or r.stock_quantity < r.qty then raise exception 'out_of_stock'; end if;
    if r.qty > v_max_qty then raise exception 'invalid_input'; end if;
    v_subtotal := v_subtotal + r.price_cents::bigint * r.qty;
    v_lines := v_lines + 1;
  end loop;
  if v_lines = 0 or v_lines <> jsonb_array_length(v_norm) then raise exception 'product_unavailable'; end if;
  if v_subtotal > 10000000 then raise exception 'invalid_input'; end if;

  insert into public.shop_orders
    (id, source, family_id, placed_by, customer_name, status, payment_method, payment_status,
     subtotal_cents, shipping_cents, receipt_path, receipt_filename, receipt_uploaded_at,
     delivery_name, delivery_address, delivery_phone, delivery_email, guest_ip_hash)
  values
    (p_id, p_source, p_family, p_actor, coalesce(nullif(btrim(p_customer_name), ''), v_name), 'Pending', p_method,
     (case when p_method = 'advance' then 'pending_verification' else 'unpaid' end)::public.shop_payment_status,
     v_subtotal::int, v_ship,
     case when p_method = 'advance' then p_receipt_path end,
     case when p_method = 'advance' then p_receipt_filename end,
     case when p_method = 'advance' then now() end,
     v_name, v_addr, v_phone, v_email, p_ip_hash)
  returning * into v_order;

  insert into public.shop_order_items (order_id, product_id, title, unit_price_cents, quantity)
  select v_order.id, p.id, p.title, p.price_cents, x.qty
    from jsonb_to_recordset(v_norm) as x(product_id uuid, qty int)
    join public.shop_products p on p.id = x.product_id;

  update public.shop_products p set stock_quantity = p.stock_quantity - x.qty
    from jsonb_to_recordset(v_norm) as x(product_id uuid, qty int)
   where p.id = x.product_id;

  perform private.notify_admins('shop_order_received', 'New shop order',
    format('%s placed order %s ($%s, %s).', v_order.customer_name, v_order.order_number,
           to_char(v_order.total_cents / 100.0, 'FM999990.00'),
           case when p_method = 'advance' then 'bank transfer — verify payment' else 'cash on delivery' end),
    '/admin/orders', jsonb_build_object('order_id', v_order.id, 'source', p_source));
  return v_order;
end $$;

create or replace function public.place_portal_order(
  p_id uuid, p_items jsonb, p_method public.shop_payment_method, p_delivery jsonb,
  p_receipt_path text default null, p_receipt_filename text default null
) returns public.shop_orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_fam uuid := private.my_family_id(); v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_fam is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_method = 'advance' and (
       p_receipt_path is null or p_receipt_path not like (v_fam::text || '/' || p_id::text || '/%')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'shop-receipts' and o.name = p_receipt_path)) then
    raise exception 'proof_missing';
  end if;
  select parent_name into v_name from public.families where id = v_fam;
  return private.create_shop_order(p_id, 'portal', v_fam, v_uid, v_name, p_items, p_method, p_delivery,
                                   p_receipt_path, p_receipt_filename, null);
end $$;

create or replace function public.place_guest_order(
  p_id uuid, p_items jsonb, p_method public.shop_payment_method, p_delivery jsonb,
  p_receipt_path text, p_receipt_filename text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb := coalesce(private.setting('shop'), '{}'::jsonb); v_o public.shop_orders;
begin
  if not coalesce((v_cfg->>'guest_checkout_enabled')::boolean, true) then raise exception 'guest_checkout_disabled'; end if;
  if coalesce(p_ip_hash, '') = '' then raise exception 'invalid_input'; end if;
  if (select count(*) from public.shop_orders where guest_ip_hash = p_ip_hash and created_at > now() - interval '1 hour')
       >= coalesce((v_cfg->>'guest_orders_per_ip_hour')::int, 5) then
    raise exception 'rate_limited';
  end if;
  if p_method = 'advance' and (
       p_receipt_path is null or p_receipt_path not like ('guest/' || p_id::text || '/%')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'shop-receipts' and o.name = p_receipt_path)) then
    raise exception 'proof_missing';
  end if;
  v_o := private.create_shop_order(p_id, 'guest', null, null, null, p_items, p_method, p_delivery,
                                   p_receipt_path, p_receipt_filename, p_ip_hash);
  return jsonb_build_object('id', v_o.id, 'order_number', v_o.order_number, 'total_cents', v_o.total_cents,
                            'status', v_o.status, 'payment_status', v_o.payment_status, 'created_at', v_o.created_at);
end $$;

create or replace function public.verify_shop_order(p_order_id uuid, p_action text, p_note text default null)
returns public.shop_orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); o public.shop_orders;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid_action'; end if;
  select * into o from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.payment_method <> 'advance' or o.payment_status <> 'pending_verification' or o.status = 'Cancelled' then
    raise exception 'payment_not_pending';
  end if;
  if p_action = 'approve' then
    update public.shop_orders
       set payment_status = 'paid',
           status = case when status = 'Pending' then 'Processing'::public.shop_order_status else status end,
           reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = o.id returning * into o;
    if o.family_id is not null then
      perform private.notify_family(o.family_id, 'shop_payment_approved', 'Order payment verified',
        format('Payment for order %s was verified. We''re preparing your items.', o.order_number),
        '/parent/orders', jsonb_build_object('order_id', o.id));
    end if;
  else
    update public.shop_orders
       set payment_status = 'unpaid', status = 'Pending',
           reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = o.id returning * into o;
    if o.family_id is not null then
      perform private.notify_family(o.family_id, 'shop_payment_rejected', 'Order payment could not be verified',
        coalesce(nullif(btrim(p_note), ''), format('We couldn''t verify the payment for order %s. Please contact us.', o.order_number)),
        '/parent/orders', jsonb_build_object('order_id', o.id));
    end if;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'shop_order.' || p_action, 'shop_order', o.id::text, jsonb_build_object('note', p_note, 'total_cents', o.total_cents, 'source', o.source));
  return o;
end $$;

create or replace function public.admin_update_shop_order_status(p_order_id uuid, p_status public.shop_order_status, p_note text default null)
returns public.shop_orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); o public.shop_orders; v_ok boolean;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  v_ok := (o.status = 'Pending'    and p_status in ('Processing', 'Cancelled'))
       or (o.status = 'Processing' and p_status in ('Shipped', 'Cancelled'))
       or (o.status = 'Shipped'    and p_status = 'Delivered');
  if not v_ok then raise exception 'invalid_transition'; end if;
  if p_status = 'Processing' and o.payment_method = 'advance' and o.payment_status <> 'paid' then raise exception 'payment_required'; end if;
  if p_status = 'Cancelled' then
    perform private.release_shop_stock(o.id);
    update public.shop_orders
       set status = 'Cancelled',
           payment_status = (case when payment_status = 'paid' then 'refunded' else 'unpaid' end)::public.shop_payment_status,
           review_note = coalesce(p_note, review_note)
     where id = o.id returning * into o;
  else
    update public.shop_orders
       set status = p_status,
           payment_status = case when p_status = 'Delivered' and payment_method = 'cod'
                                 then 'paid'::public.shop_payment_status else payment_status end
     where id = o.id returning * into o;
  end if;
  if o.family_id is not null and p_status in ('Shipped', 'Delivered', 'Cancelled') then
    perform private.notify_family(o.family_id, 'shop_order_update',
      case p_status when 'Shipped' then 'Your order is on its way' when 'Delivered' then 'Order delivered' else 'Order cancelled' end,
      format('Order %s is now %s.', o.order_number, lower(p_status::text)),
      '/parent/orders', jsonb_build_object('order_id', o.id, 'status', p_status));
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'shop_order.status', 'shop_order', o.id::text, jsonb_build_object('status', p_status, 'note', p_note));
  return o;
end $$;

create or replace function public.admin_shop_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total_orders',         (select count(*) from public.shop_orders),
    'pending_verification', (select count(*) from public.shop_orders where payment_status = 'pending_verification'),
    'revenue_cents',        (select coalesce(sum(total_cents), 0) from public.shop_orders where payment_status = 'paid'),
    'low_stock_products',   (select count(*) from public.shop_products where is_active and stock_quantity <= low_stock_threshold));
end $$;

create or replace function private.cancel_stale_advance_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_days int := coalesce((private.setting('shop')->>'advance_hold_days')::int, 3);
begin
  for r in select id, family_id, order_number from public.shop_orders
            where payment_method = 'advance' and payment_status = 'unpaid' and status = 'Pending'
              and coalesce(reviewed_at, created_at) < now() - make_interval(days => v_days)
            order by id for update loop
    perform private.release_shop_stock(r.id);
    update public.shop_orders set status = 'Cancelled' where id = r.id;
    if r.family_id is not null then
      perform private.notify_family(r.family_id, 'shop_order_update', 'Order cancelled',
        format('Order %s was cancelled because payment was not completed.', r.order_number),
        '/parent/orders', jsonb_build_object('order_id', r.id));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.shop_categories  enable row level security;
alter table public.shop_products    enable row level security;
alter table public.shop_orders      enable row level security;
alter table public.shop_order_items enable row level security;
alter table public.rate_limit_hits  enable row level security;

create policy shop_categories_select on public.shop_categories for select to anon, authenticated using (true);
create policy shop_categories_admin  on public.shop_categories for all    to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy shop_products_admin on public.shop_products for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy shop_orders_select on public.shop_orders for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy shop_order_items_select on public.shop_order_items for select to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = order_id));

-- ── Privileges ────────────────────────────────────────────────────────────────
alter default privileges in schema private revoke execute on functions from public;

revoke all on public.shop_categories, public.shop_products, public.shop_orders, public.shop_order_items, public.rate_limit_hits
  from anon, authenticated;
revoke all on sequence public.shop_order_seq from anon, authenticated;
revoke execute on function
  public.get_shop_products(), public.check_rate_limit(text, text, int, int),
  public.place_portal_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text),
  public.place_guest_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text, text),
  public.verify_shop_order(uuid, text, text),
  public.admin_update_shop_order_status(uuid, public.shop_order_status, text),
  public.admin_shop_stats()
  from public, anon, authenticated;

grant select on public.shop_categories to anon, authenticated;
grant insert, update, delete on public.shop_categories to authenticated;
grant select on public.shop_products, public.shop_orders, public.shop_order_items to authenticated;
grant insert (category, title, description, details, price_cents, image_path, stock_quantity, low_stock_threshold, is_active, sort_order),
      update (category, title, description, details, price_cents, image_path, stock_quantity, low_stock_threshold, is_active, sort_order)
  on public.shop_products to authenticated;

grant execute on function public.get_shop_products() to anon, authenticated;
grant execute on function
  public.place_portal_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text),
  public.verify_shop_order(uuid, text, text),
  public.admin_update_shop_order_status(uuid, public.shop_order_status, text),
  public.admin_shop_stats()
  to authenticated;
grant execute on function
  public.place_guest_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text, text),
  public.check_rate_limit(text, text, int, int)
  to service_role;

-- ── Storage ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-receipts', 'shop-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('shop-products', 'shop-products', true,   5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy shop_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-receipts' and (storage.foldername(name))[1] = (select private.my_family_id())::text);
create policy shop_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'shop-receipts'
         and ((storage.foldername(name))[1] = (select private.my_family_id())::text or (select private.is_admin())));

create policy shop_products_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-products' and (select private.is_admin()));
create policy shop_products_img_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-products' and (select private.is_admin()));
create policy shop_products_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-products' and (select private.is_admin()));

-- ── Cron ──────────────────────────────────────────────────────────────────────
select cron.schedule('fb-shop-stale-orders',  '0 17 * * *',   $$select private.cancel_stale_advance_orders()$$);
select cron.schedule('fb-prune-rate-limits',  '*/30 * * * *', $$delete from public.rate_limit_hits where created_at < now() - interval '1 day'$$);
