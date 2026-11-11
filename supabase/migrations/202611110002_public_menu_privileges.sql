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
