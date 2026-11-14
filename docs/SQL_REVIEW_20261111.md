# SQL review: delivery request security and menu privileges

These are the exact two new migration files. Every new/replaced database function, RLS policy and index is included below. Apply the migration files in this order using new Supabase SQL Editor queries; do not rerun schema.sql. See [deployment and tests](SECURITY_HARDENING_20261111.md).

## 202611110001_delivery_request_security.sql

```sql
-- Run after 202611100001_restaurant_settings.sql. Reruns preserve saved settings.
begin;
alter table public.restaurant_settings add column if not exists delivery_radius_km numeric not null default 15;
alter table public.restaurant_settings drop constraint if exists restaurant_delivery_radius_valid;
alter table public.restaurant_settings add constraint restaurant_delivery_radius_valid
  check (delivery_radius_km between 0.5 and 100 and delivery_radius_km = round(delivery_radius_km, 2));
grant update (delivery_radius_km) on public.restaurant_settings to authenticated;

create or replace function public.audit_restaurant_settings() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_values jsonb; after_values jsonb;
begin
  before_values := jsonb_build_object('minimum_order_amount', old.minimum_order_amount,
    'restaurant_phone', old.restaurant_phone, 'delivery_radius_km', old.delivery_radius_km);
  after_values := jsonb_build_object('minimum_order_amount', new.minimum_order_amount,
    'restaurant_phone', new.restaurant_phone, 'delivery_radius_km', new.delivery_radius_km);
  if before_values is distinct from after_values then
    insert into public.admin_activity(actor_id, action, entity, entity_id, before_data, after_data)
      values(auth.uid(), 'UPDATE', 'restaurant_settings', 'true', before_values, after_values);
  end if;
  return new;
end $$;
revoke all on function public.audit_restaurant_settings() from public, anon, authenticated;

-- Only keyed hashes are retained, never raw IP addresses or customer details.
create table if not exists public.delivery_request_buckets (
  bucket text primary key, window_started_at timestamptz not null,
  requests integer not null check (requests >= 0)
);
alter table public.delivery_request_buckets enable row level security;
revoke all on public.delivery_request_buckets from public, anon, authenticated;
create index if not exists delivery_request_buckets_cleanup on public.delivery_request_buckets(window_started_at);

-- Internal atomic fixed-window counter: 0 means allowed, otherwise seconds to wait.
create or replace function public.take_delivery_request_slot(p_bucket text, p_limit integer, p_seconds integer)
returns integer language plpgsql security definer set search_path='' as $$
declare current_bucket public.delivery_request_buckets; stamp timestamptz;
begin
  if p_bucket is null or length(p_bucket)>100 or p_limit is null or p_limit<1 or p_seconds is null or p_seconds<1 then
    raise exception 'Invalid limiter configuration';
  end if;
  insert into public.delivery_request_buckets values(p_bucket,clock_timestamp(),0) on conflict do nothing;
  select * into current_bucket from public.delivery_request_buckets where bucket=p_bucket for update;
  stamp:=clock_timestamp();
  if current_bucket.window_started_at+make_interval(secs=>p_seconds)<=stamp then
    current_bucket.window_started_at:=stamp; current_bucket.requests:=0;
  end if;
  if current_bucket.requests>=p_limit then
    return greatest(1,ceil(extract(epoch from current_bucket.window_started_at+make_interval(secs=>p_seconds)-stamp))::integer);
  end if;
  update public.delivery_request_buckets set requests=current_bucket.requests+1,
    window_started_at=current_bucket.window_started_at where bucket=p_bucket;
  return 0;
end $$;
revoke all on function public.take_delivery_request_slot(text,integer,integer) from public, anon, authenticated, service_role;

create or replace function public.check_delivery_request(p_client_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare retry_after integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid client reference'; end if;
  -- An aggregate limit also bounds abuse using many or forged client addresses.
  retry_after:=public.take_delivery_request_slot('estimate:global',60,60);
  if retry_after=0 then retry_after:=public.take_delivery_request_slot('estimate:minute:'||p_client_hash,10,60); end if;
  if retry_after=0 then retry_after:=public.take_delivery_request_slot('estimate:day:'||p_client_hash,100,86400); end if;
  if retry_after>0 then return jsonb_build_object('allowed',false,'retryAfter',retry_after); end if;
  delete from public.delivery_request_buckets where bucket in (
    select bucket from public.delivery_request_buckets
    where window_started_at<clock_timestamp()-interval '2 days' order by window_started_at limit 50
  );
  return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.check_delivery_request(text) from public, anon, authenticated;
grant execute on function public.check_delivery_request(text) to service_role;

-- Shared by estimate-delivery AND create-order, independent of client headers.
-- Beyond this ORS budget, retain the existing labelled approximate distance.
create or replace function public.reserve_delivery_route() returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if public.take_delivery_request_slot('routing:minute',30,60)>0 then return false; end if;
  if public.take_delivery_request_slot('routing:day',1000,86400)>0 then return false; end if;
  return true;
end $$;
revoke all on function public.reserve_delivery_route() from public, anon, authenticated;
grant execute on function public.reserve_delivery_route() to service_role;
commit;
```

## 202611110002_public_menu_privileges.sql

```sql
-- Preserve public menu reads and authenticated admin editing. Safe to rerun.
begin;
revoke all on public.categories, public.menu_items, public.item_sizes from public, anon, authenticated;
grant select on public.categories, public.menu_items, public.item_sizes to anon, authenticated;
grant insert, update, delete on public.categories, public.menu_items, public.item_sizes to authenticated;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.item_sizes enable row level security;

-- Restrictive policies guard against accidentally permissive extra policies.
drop policy if exists categories_write_insert_guard on public.categories;
create policy categories_write_insert_guard on public.categories as restrictive for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists categories_write_update_guard on public.categories;
create policy categories_write_update_guard on public.categories as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists categories_write_delete_guard on public.categories;
create policy categories_write_delete_guard on public.categories as restrictive for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists menu_items_write_insert_guard on public.menu_items;
create policy menu_items_write_insert_guard on public.menu_items as restrictive for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists menu_items_write_update_guard on public.menu_items;
create policy menu_items_write_update_guard on public.menu_items as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists menu_items_write_delete_guard on public.menu_items;
create policy menu_items_write_delete_guard on public.menu_items as restrictive for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists item_sizes_write_insert_guard on public.item_sizes;
create policy item_sizes_write_insert_guard on public.item_sizes as restrictive for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists item_sizes_write_update_guard on public.item_sizes;
create policy item_sizes_write_update_guard on public.item_sizes as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists item_sizes_write_delete_guard on public.item_sizes;
create policy item_sizes_write_delete_guard on public.item_sizes as restrictive for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.delivery_rates from public, anon, authenticated;
grant select on public.delivery_rates to anon, authenticated;
grant update (tiers) on public.delivery_rates to authenticated;
alter table public.delivery_rates enable row level security;
drop policy if exists delivery_rates_write_guard on public.delivery_rates;
create policy delivery_rates_write_guard on public.delivery_rates as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Existing admin upload policies remain. Other buckets are unaffected.
drop policy if exists menu_images_insert_guard on storage.objects;
create policy menu_images_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'menu-images' or (select public.is_admin()));
drop policy if exists menu_images_update_guard on storage.objects;
create policy menu_images_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'menu-images' or (select public.is_admin()))
  with check (bucket_id <> 'menu-images' or (select public.is_admin()));
drop policy if exists menu_images_delete_guard on storage.objects;
create policy menu_images_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'menu-images' or (select public.is_admin()));
commit;
```

