# Change the homepage hero and welcome popup

1. Open Supabase → SQL Editor → **New query**. Run the entire file `supabase/migrations/202611130001_website_images.sql`. It is safe to run again and preserves saved images. Do not rerun `supabase/schema.sql`.
2. Push the frontend changes to GitHub and wait for Vercel to deploy. **No Edge Functions or new secrets are required.** The existing public `menu-images` bucket and its admin-only upload/delete policies must already be installed.
3. Sign in and open **Admin → Settings and alerts → Website images**. Choose a hero image or popup image, check its preview, then click its Save button. Each image saves independently.
4. Open the homepage to see the hero. To test the popup, use a fresh private browser session: it still appears once per session after the menu and image settings load.

Use a wide landscape image for the hero and a portrait/square image for the popup. Upload JPG, PNG or WebP up to 2 MB. The existing image processor resizes to a maximum dimension of 1,000 px and encodes WebP. Original local images remain the defaults if nothing has been uploaded or a saved image cannot load. An image-settings request failure never prevents customers loading the menu. A successful refresh occurs on homepage mount or browser-window focus; a page left continuously open does not poll for image changes.

New images use unique paths under `menu-images/website/hero/` and `menu-images/website/popup/`, avoiding stale cached replacements. A stale editor cannot overwrite another admin's newer save: reload images before trying again. The previous uploaded file is removed only after the replacement row is confirmed saved. If a network response is uncertain, the new file is retained to avoid deleting a potentially published image; this can leave an unused upload in Storage. Cleanup failure is reported separately from a successful save. The original files in `public/images` are never deleted by the editor.

This update does not change the loading logo, special-offer text or popup display frequency. Future image replacements need only Save, with no redeployment.

## Validation

`node scripts/test-website-images.mjs` checks the new database policies, permitted paths, stale-save condition and migration reruns in isolated PGlite. `node scripts/test-website-images-browser.mjs` uses the local Playwright/Chrome setup and a dev server on port 5182, with every external request mocked or blocked. It checks image validation/resizing, preview before publishing, separate saves, upload/save failure recovery, old-file cleanup, mobile width, customer images, popup dismissal and default-image fallback. Run `npm run build` for the frontend build.

After deployment, also test with a real admin session and a normal account. The normal account must not update image settings or upload to `menu-images`.

## Full new RLS policies

The table has only two public image-path rows. No customer details or secrets are stored. Public reads and admin-only updates are permitted; clients have no INSERT or DELETE grant and can update only `image_path`.

```sql
drop policy if exists website_images_read on public.website_images;
create policy website_images_read on public.website_images
  for select to anon,authenticated using(true);

drop policy if exists website_images_admin_update on public.website_images;
create policy website_images_admin_update on public.website_images
  for update to authenticated
  using((select public.is_admin())) with check((select public.is_admin()));
```

No new database functions or separate indexes are added. The table's `slot` primary key creates its standard unique index. Existing Storage policies on `menu-images` are reused without modification.
