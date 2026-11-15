-- Extend the existing website images without replacing hero/popup settings.
begin;
alter table public.website_images drop constraint if exists website_images_slot_check;
alter table public.website_images add constraint website_images_slot_check check (slot in ('hero','popup','logo'));
insert into public.website_images(slot) values('logo') on conflict(slot) do nothing;
alter table public.website_images enable row level security;
revoke all on public.website_images from public,anon,authenticated;
grant select on public.website_images to anon,authenticated,service_role;
grant update(image_path) on public.website_images to authenticated;
drop policy if exists website_images_read on public.website_images;
create policy website_images_read on public.website_images for select to anon,authenticated using(true);
drop policy if exists website_images_admin_update on public.website_images;
create policy website_images_admin_update on public.website_images for update to authenticated
  using((select public.is_admin())) with check((select public.is_admin()));
commit;
