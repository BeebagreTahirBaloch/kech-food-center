-- Existing menu-images bucket and its admin upload policies are reused.
begin;
create table if not exists public.website_images (
  slot text primary key check (slot in ('hero','popup')),
  image_path text check (image_path is null or image_path ~ ('^website/' || slot || '/[a-f0-9-]{36}\.webp$'))
);
insert into public.website_images(slot) values('hero'),('popup') on conflict(slot) do nothing;
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
