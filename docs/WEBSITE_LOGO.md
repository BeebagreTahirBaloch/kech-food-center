# Admin-controlled website logo

## Setup

1. In Supabase SQL Editor, open a **NEW query** and run `supabase/migrations/202611150001_website_logo.sql`. This requires the existing website-images migration (`202611130001_website_images.sql`) to have been installed. Do not rerun `supabase/schema.sql`. The new migration is safe to rerun and preserves all three saved images.
2. Push the frontend and new `api/` and `server/` files to GitHub. Vercel deploys the website and the public `/api/brand-icon` function together. No Supabase Edge Functions need deployment and there are no new secrets. Vercel must retain the existing `VITE_SUPABASE_URL` and public `VITE_SUPABASE_ANON_KEY` environment variables; the icon route never uses a service-role key.
3. Open **Admin → Settings and alerts → Website images → Website logo**. Choose JPG, PNG or WebP up to 2 MB, inspect the preview, then click **Save logo image**. A transparent PNG is recommended. Choosing a file alone does not publish it.

## Behavior

- The logo is reused in the header, menu loading/error overlay, footer, and Get the app page. The browser tab and Apple touch icons use its generated square image. Header/loading dimensions stay fixed; custom logos are contained rather than cropped. Original bundled logos remain fallbacks when the database or image is unavailable.
- The logo is resized to a maximum dimension of 1,000 px. Two PNG icons (192×192 and 512×512) are generated on a white square with padding, without stretching. All three files must upload before the admin publishes the new logo path. Hero and welcome-popup settings stay independent.
- Each save uses a unique `website/logo/<uuid>.webp` path, with sibling `<uuid>-192.png` and `<uuid>-512.png` files. A conditional update refuses stale saves from another admin. Old files are deleted only after confirmed publication. Uncertain/failed uploads may leave unused files in Storage; never delete a possibly-published file automatically after a network failure.
- A shared provider loads the public logo once per page, refreshes when returning to the page and every minute while visible, and caches only the validated image path in localStorage so the loading logo can appear immediately on later visits. The first visit may briefly show the bundled fallback while settings load. Cached logos cannot block orders or menu loading.
- Customer, owner and rider manifests keep their existing start URLs, scopes and identities. Their icons and push-notification images use `/api/brand-icon?size=192` or `size=512`. This read-only Vercel route looks up only the public logo path and redirects to the generated Storage icon; configuration/network failures redirect to the bundled icon. The redirect can be cached for up to one minute.
- Existing installed apps may retain their old Home Screen icon until the browser/OS refreshes it. Reinstalling may be required. This update does not promise immediate OS-level icon replacement. New installations use the current icon after the short cache period. See [Chrome's manifest update behavior](https://web.dev/articles/manifest-updates).
- The Vite development/preview server supplies the same icon route locally. Production uses [Vercel's Node.js function support for Vite](https://vercel.com/docs/frameworks/frontend/vite).

## Test

1. Upload and save a logo. Reload the homepage, cart, orders, tracking and Get the app page; check header/footer and the browser tab. Throttle the connection to inspect the loading overlay, then reload again to check the cached logo.
2. Check a wide and a square logo on a phone. Neither should be stretched or cropped.
3. Change hero or popup and verify the logo stays unchanged. A failed upload must leave the old published logo intact.
4. Try with a non-admin account: it must not update website_images or upload files to menu-images.
5. Open `/api/brand-icon?size=192` and `/api/brand-icon?size=512` on Vercel. Check the new icons and a new app installation. Check an actual push notification on a supported phone.

Automated checks: `node scripts/test-website-logo.mjs`, `node scripts/test-website-images-browser.mjs` (local dev server at port 5182), and `npm run build`. Database tests run in isolated PGlite. Browser tests use mocked uploads/database requests and actual browser canvas resizing. They do not publish real images or certify installed-device icon refresh timing.

## RLS policies, indexes and functions

The migration recreates the existing two policies, using their original admin check:

```sql
drop policy if exists website_images_read on public.website_images;
create policy website_images_read on public.website_images
  for select to anon,authenticated using(true);

drop policy if exists website_images_admin_update on public.website_images;
create policy website_images_admin_update on public.website_images
  for update to authenticated
  using((select public.is_admin())) with check((select public.is_admin()));
```

Only `image_path` has an UPDATE grant for authenticated users; RLS restricts it to admins. Anonymous users can read the three image paths but cannot change them. No client INSERT/DELETE grant is added. The existing path constraint requires a path under the row's own slot. Existing menu-images Storage policies continue to restrict uploads, replacement and deletion to admins.

**New database functions: none. New indexes: none. New Storage policies: none.** The existing slot primary-key index is retained. Customer order data and policies are unchanged.
