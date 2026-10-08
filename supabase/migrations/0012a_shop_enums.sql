-- 0012a_shop_enums.sql
-- Run this file UNWRAPPED (no begin/commit) — new enum values cannot be used in the same transaction that adds them.
alter type public.notification_type add value if not exists 'shop_order_received';
alter type public.notification_type add value if not exists 'shop_payment_approved';
alter type public.notification_type add value if not exists 'shop_payment_rejected';
alter type public.notification_type add value if not exists 'shop_order_update';
