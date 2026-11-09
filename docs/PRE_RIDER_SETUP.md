   # Phase 1 deployment (current)

Apply `supabase/migrations/202611010001_delivery_estimate.sql` in a NEW SQL Editor query. It is safe to rerun; schema.sql is unchanged. It adds nullable estimated_delivery_charge, preserving old orders without inventing historical estimates. No new RLS policies, indexes or database functions. The only permission change grants SELECT of this safe column under existing single-order RLS. Admin sales still use final delivery_charge for delivered orders only.

Deploy:
```sh
npx supabase functions deploy estimate-delivery
npx supabase functions deploy cancel-order
npx supabase functions deploy create-order
npx supabase functions deploy get-order
npx supabase functions deploy telegram-webhook --no-verify-jwt
```
Deploy the frontend after the migration and functions. No new secrets: retain RESTAURANT_LAT, RESTAURANT_LNG, ALLOWED_ORIGIN and existing Telegram secrets. Set public VITE_RESTAURANT_LAT/LNG to the same coordinates. Keep service credentials server-only.

Single source: `supabase/functions/_shared/delivery.js` exports suggestedCharge and the tier table: 0–5 km Rs.100, over 5–8 km Rs.150, over 8 km Rs.300. Browser pin estimates and server estimates use OSRM with Haversine × 1.3 fallback. README documents these values; it is not a second executable calculation. Telegram suggestions use the same function. Checkout never sends a trusted price: create-order recomputes and saves the estimate. Maps links resolve only on the server; failed estimates show the tier table. Estimates do not prevent checkout.

The customer confirms by sending the order. Only pending orders can be cancelled through cancel-order (UUID-specific, atomic pending check). Rider acceptance plus charge/ETA transitions directly to confirmed. Tracking shows four steps, final versus saved estimated charge, and a countdown. No frontend call to customer-respond remains. Keep it deployed for old clients and legacy quoted orders; do not remove it until those are resolved and old clients are retired. Existing quoted orders need completing through the legacy endpoint before retiring it; this phase does not bulk-change existing orders or Telegram messages.

Test: drop/move pins and paste long/short Maps links; verify loading, estimates, totals and fallback table. Send an order; verify estimated_delivery_charge in Supabase. Cancel a pending order and check Telegram. On another order accept, choose a different charge and ETA: verify automatic confirmation, saved estimate versus final amount, countdown and delivery buttons. Try cancellation after acceptance (must fail). Mark out for delivery then delivered; check admin sales use final charge. Run `node scripts/test-delivery.mjs`, `node scripts/test-order-progress.mjs`, `node scripts/test-admin-orders.mjs`, and `npm run build`.

Phase 1 only; later phases have not been implemented. This section supersedes older confirmation/estimate instructions below.

# Kech Food Center

## Confirmation at checkout (current flow)

Sending the order is the customer's confirmation; there is no second Confirm/Cancel prompt on tracking. The rider accepts, chooses a charge and ETA, then immediately receives Out for delivery, Delivered and Cancel delivery controls with the full customer/order details. Tracking shows the final charge and ETA automatically. The internal `pending`/`awaiting_charge` statuses still mean waiting for the rider; `confirmed` means the rider has finished setting delivery details. The existing timestamp trigger starts the countdown at that point.

Deploy the frontend and run `npx supabase functions deploy telegram-webhook --no-verify-jwt`. No new SQL or schema change is required. Keep the existing `customer-respond` function deployed for compatibility: old `quoted` orders finalize automatically when their tracking page opens, including refreshing the rider's buttons. New orders do not depend on the customer keeping the page open. Older setup sections below describe the former confirmation step; this section supersedes that step.

Test: send an order, verify there are no customer confirmation buttons, accept in Telegram, choose charge and ETA, and verify the countdown, final total and rider delivery buttons appear without customer action. Mark Out for delivery, then Delivered. Repeat with free delivery and rider cancellation. Existing completed orders remain unchanged.

## Customer status alerts and active-order bar

This update is frontend-only. No SQL query or Edge Function redeployment is needed, and `schema.sql` is unchanged. Build and deploy the frontend. The existing Telegram acceptance, quote and confirmation steps are unchanged.

Tracking listens on `order:<uuid>` and fetches safe data through `get-order`. It polls every 10 seconds when Realtime is disconnected, every 30 seconds as a connected safety check, and refreshes when the tab becomes visible or the network returns. Connected/Reconnecting describes the Realtime connection; request failures remain visible separately. Initial loading establishes a baseline; each subsequently observed status is announced once per tracking-page visit. A reconnect or repeated poll does not duplicate an alert. A persistent dismissible banner and temporary toast work without browser permissions. Accepting shows an immediate alert while the rider sets the charge, then the completed quote includes charge (including free delivery), total and ETA.

Tap **Enable sound and alerts** to unlock a soft tone and request notification permission. There is no permission prompt on load. System alerts are best-effort: browser support, permission and device settings vary. Sound needs an unlocked audio context. The tab title flashes for updates received while hidden and resets when visible or when leaving tracking. Browsers may suspend background tabs, so these are open-page alerts, not guaranteed closed-browser push delivery.

Home and cart show a small **Your active order** bar for the newest saved non-terminal order, checking older saved orders if the newest is finished. Full history remains on `/orders`. Checkout saves only order UUID, placement time and subtotal in guarded localStorage; no customer name, phone or address is stored. Delivered, cancelled and declined orders are hidden from the active bar. Storage-disabled browsers cannot restore order history after leaving.

Test on the deployed HTTPS site (or localhost):
1. Place an order and keep `/track/:id` open. Tap **Enable sound and alerts**, allow permission and hear the short test tone.
2. Accept in Telegram, then choose charge and ETA. Check the persistent acceptance banner, quote values, toast, sound and system notification. Confirm on the website.
3. Switch to another browser tab. Mark **Out for delivery** in Telegram and check the flashing title and permitted system alert. Return: the normal title returns and the banner remains until closed.
4. Mark **Delivered** and check the delivery alert. Repeated polls/reconnection must not repeat the sound or toast for that status. Test cancellation and declined orders separately.
5. Return to home/cart with an active order, then reopen the site: the Track bar should appear. After completion it disappears. Deny notification permission and verify banners still work. Disconnect Realtime (while allowing HTTPS requests) and verify Reconnecting plus updates within the 10-second polling interval, allowing request time.

Checks: `node scripts/test-order-alerts.mjs`, `node scripts/test-order-progress.mjs`, `npm run build`. Live Telegram, device audio and OS notification delivery require the manual test above.

Optional closed-browser push is **not implemented**. It requires owner approval first: add a service worker, generate VAPID keys (private key only in server secrets), create an RLS-protected subscription table, provide explicit subscribe/unsubscribe controls, and send minimal status notifications from the webhook. Bind subscriptions to an authorized order tracking token, validate subscription endpoints, restrict server access, expire/delete subscriptions when no longer needed and avoid names, phone numbers, addresses or item details in push payloads. Explain that the browser's push provider receives delivery metadata before asking customers to opt in.

## Free delivery and rider cancellation

Run `supabase/migrations/202610310003_free_delivery.sql` in a new SQL Editor query, then redeploy `create-order`, `customer-respond`, and `telegram-webhook --no-verify-jwt`. Do not rerun schema.sql. The rider can select Free delivery (Rs.0), then the ETA as usual. Cancel delivery appears in every active-order keyboard, including while waiting for customer confirmation. Cancellation is allowed from pending through out-for-delivery; completed, declined or already-cancelled orders cannot be changed by old buttons. It cancels the whole order, updates tracking and stops the countdown. The new button appears on new or subsequently updated Telegram messages; old Telegram messages are not retroactively edited. Test free delivery and cancellation before quoting, after confirmation, and while out for delivery.

## Owner orders dashboard

Run `supabase/migrations/202610310002_admin_orders.sql` in a NEW Supabase SQL Editor query after the existing tracking/menu migrations. Do not rerun or change `schema.sql`. No Edge Function redeployment is needed for this dashboard. Build and deploy the frontend, then sign in at `/admin/orders` with the existing owner account. The menu admin has an Orders and sales link; the dashboard links back to menu administration.

Only admins can call `admin_orders_report`. Private columns are deliberately NOT granted to the authenticated role: otherwise a normal customer's existing single-order policy would expose private data. The checked SQL function returns full rows for admins, calculates totals in SQL and pages 25 rows. Direct table RLS additionally permits admins to read all rows of the safe columns. Existing anonymous/customer column restrictions and per-order tracking remain intact.

Today, calendar week (Monday start), and month use Asia/Karachi. Calendar count cards cover all orders; the other cards and CSV follow the selected placement-date range, status and search. Sales, delivery-charge totals and average order value include delivered orders only. The default range is Today; custom dates are inclusive. Live changes use an admin-only private Realtime signal with no customer data in its payload, plus polling every 30 seconds.

Test: place an order, sign in as the owner, and find it on `/admin/orders`. Confirm and deliver it using the existing Telegram flow; the delivered sales should increase by subtotal plus delivery charge. Check filters, paging, details, CSV and phone layout. Sign out and visit the URL: only the login form should appear. Sign in as a normal non-admin: it must sign out with Not authorized. Verify customer tracking still works. Local checks: `node scripts/test-admin-orders.mjs` and `npm run build`.

New policies in this migration:

```sql
create policy orders_admin_read on public.orders
for select to authenticated using(public.is_admin());

create policy admin_orders_broadcast_read on realtime.messages
for select to authenticated
using(realtime.topic()='admin-orders' and public.is_admin());
```

The original menu data, food photos, red and white color palette, and Poppins typography are kept in a React + Vite app. Customers place an order with a delivery pin or Google Maps link. A Supabase Edge Function validates prices, estimates road distance with OSRM (Haversine × 1.3 fallback), saves the order, and sends it to the rider on Telegram. The rider sets a charge and ETA in Telegram; the customer confirms the final total on `/track/:id`.

## Run the frontend

Use Node.js 20.19+ or 22.12+ and npm.

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RESTAURANT_LAT`, and `VITE_RESTAURANT_LNG`.
2. Install dependencies and start Vite:

   ```sh
   npm install
   npm run dev
   ```

3. Open the local URL Vite prints, usually `http://localhost:5173`.

Create a production build with `npm run build`. Vercel uses `dist` as its output directory. `vercel.json` rewrites React Router paths such as `/track/:id` to the app entry page.

## Supabase setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) once in the SQL Editor. For an existing project, apply only the new menu migration as described below.
2. Keep the Supabase project URL and **anon** key in the Vite environment. Never put the service role key, Telegram bot token, rider chat ID, or webhook secret in a `VITE_` variable.
3. Set function secrets. `ALLOWED_ORIGIN` is an exact, comma-separated allowlist; include your Vercel origin and the local Vite origin while developing:

   ```sh
   supabase secrets set \
     TELEGRAM_BOT_TOKEN="<BOT_TOKEN>" \
     TELEGRAM_RIDER_CHAT_ID="<RIDER_CHAT_ID>" \
     TELEGRAM_WEBHOOK_SECRET="<LONG_RANDOM_SECRET>" \
     RESTAURANT_LAT="<RESTAURANT_LATITUDE>" \
     RESTAURANT_LNG="<RESTAURANT_LONGITUDE>" \
     ALLOWED_ORIGIN="https://<YOUR_VERCEL_DOMAIN>,http://localhost:5173"
   ```

   Replace the placeholders. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically to hosted Edge Functions; do not try to set these reserved secrets with the CLI. Use the restaurant's actual coordinates for `RESTAURANT_LAT/LNG` and the same values for `VITE_RESTAURANT_LAT/LNG` in Vercel. Do not commit real secrets.
4. Deploy the functions:

   ```sh
   supabase functions deploy create-order
   supabase functions deploy get-order
   supabase functions deploy customer-respond
   supabase functions deploy telegram-webhook --no-verify-jwt
   ```

   `telegram-webhook` checks Telegram's `X-Telegram-Bot-Api-Secret-Token` itself. The other functions use Supabase's normal gateway JWT verification.

## Create the Telegram bot and connect the rider

1. In Telegram, open **@BotFather**, send `/newbot`, follow its prompts, and save the bot token as `TELEGRAM_BOT_TOKEN` in Supabase secrets.
2. Open the new bot as the rider and a press **Start**. The rider needs to start the bot before it can send them order notifications.
3. Before setting a webhook, get the rider's chat ID. Open this URL in a browser, replacing `<BOT_TOKEN>`:

   ```text
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```

   Find the rider's `/start` update and copy `message.chat.id` into `TELEGRAM_RIDER_CHAT_ID`. If the rider uses a group, add the bot to that group, send a message there, and use that group's `message.chat.id`.
4. Set the webhook. Replace `<BOT_TOKEN>`, `<PROJECT_REF>`, and `<LONG_RANDOM_SECRET>` with the same values stored in Supabase:

   ```sh
   curl --request POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     --header "Content-Type: application/json" \
     --data '{"url":"https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook","secret_token":"<LONG_RANDOM_SECRET>"}'
   ```

   The secret must match `TELEGRAM_WEBHOOK_SECRET`. Check the response for `"ok":true`.

## Deploy to Vercel

Import this repository in Vercel, keep the framework preset as **Vite**, and set the build command to `npm run build` and output directory to `dist`. Add these environment variables for Production (and Preview if needed):

```text
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
VITE_RESTAURANT_LAT=<RESTAURANT_LATITUDE>
VITE_RESTAURANT_LNG=<RESTAURANT_LONGITUDE>
```

Add the exact deployed Vercel origin to `ALLOWED_ORIGIN` in Supabase secrets. For example, use `https://kech-food-center.vercel.app`; don't include a trailing slash. Redeploy the Edge Functions after changing their code or secrets.

## Order and rider flow

- Checkout shows the subtotal only and tells customers the rider will set the delivery charge based on distance.
- `create-order` accepts a pin or Google Maps URL, including short links, recomputes item prices from the database using `price_menu_cart`, and stores an immutable item/size/price snapshot with `pending` status and no delivery charge. `src/data/menu.js` is retained only as the local seed source.
- The rider receives an order message, a real Telegram location pin, distance, suggested charge, and a Google Maps Navigate button.
- Accepting offers Rs. 100, 150, 200, 300, 400, or 500 charge buttons. The next keyboard offers 30 minutes, 1 hour, or 2 hours.
- The customer sees the quote and can confirm or cancel. Status updates are sent to the single order's Realtime topic. Public tracking payloads omit customer phone, name, and address.
- The `get-order` Edge Function returns only the order named by its UUID. Table RLS grants read access only to safe tracking columns and filters direct anonymous reads by `x-order-id`; anonymous inserts, updates, deletes, and order listing are revoked.
- If Telegram notification fails after the order is saved, `telegram_error` is recorded and the customer still receives a tracking link. Check the Supabase order row and function logs to follow up manually.

## Assumptions and manual setup

- Delivery charges are PKR. Customer estimates and rider suggestions use: up to 5 km Rs. 100, over 5 through 8 km Rs. 150, and over 8 km Rs. 300. The rider can still choose free delivery or a different final charge using the existing buttons. Deploy the frontend and redeploy `create-order` after changing these rates; no SQL is needed.
- The restaurant coordinates, Vercel domain, Supabase project, Telegram bot, rider chat ID, and production secrets still need to be supplied by the owner in the locations above.
- OpenStreetMap tiles and the public OSRM demo service are used without an API key. For production traffic, use a hosted routing service if the public OSRM demo service's usage policy or availability becomes unsuitable.
- A failed Telegram notification does not discard the saved order; staff must check the Supabase row/logs and contact that customer.

## Backend menu and owner administration

The customer menu now loads from Supabase. `/admin` is a separate owner page, with no public navigation link. Public cart storage contains only `{ itemId, sizeId, quantity }`; prices are resolved from the current menu and recomputed by the server. Menu data refreshes every 30 seconds and when the browser regains focus. Old carts from the hardcoded catalog are cleared with a message because those IDs cannot safely identify database items. Order history and Telegram callbacks keep using the saved order snapshots.

### Deployment sequence

1. Back up your database. On an **existing installation**, run `supabase/migrations/202610300001_backend_menu.sql` once in the Supabase SQL Editor. On a **new installation**, run the complete `supabase/schema.sql` once instead; it includes this migration. Do not run both copies. This repository's migrations directory contains only the incremental menu change, so a fresh database must also receive the order schema.
2. In the hosted Supabase dashboard, open **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. The local `supabase/config.toml` also disables signups, but does not change your hosted project's setting. Keep email/password sign-in enabled.
3. Create the owner manually in **Authentication → Users → Add user** with an email and password. Copy the user's UUID and run:

   ```sql
   insert into public.admins(user_id) values ('OWNER_AUTH_USER_UUID') on conflict do nothing;
   ```

   Users cannot add themselves to `admins`. The frontend uses only the anon key and the authenticated owner's session. RLS and `is_admin()` protect database writes and Storage uploads, replacements, and deletions. Signing in as a user absent from `admins` signs that user out with “Not authorized”.
4. Run `npm install` locally, including development dependencies. Supply these **local process environment variables** (never `VITE_` variables): `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Then run:

   ```sh
   node scripts/seed-menu.js
   ```

   The script reads `src/data/menu.js`, finds images under `public/images` (falling back to `images`), compresses them to WebP up to 1000 px, uploads to the public `menu-images` bucket, and upserts categories by name, items by category/name, and sizes by item/label. A rerun preserves UUIDs and availability/deletion flags but resets seed names' prices, descriptions, photos, and sorting to the original source. Use it for initial migration, not ongoing menu editing. Do not rename seeded items between seed retries. Remove the service key from your process environment after seeding; never commit it.
5. Deploy `create-order` again **after** applying the migration:

   ```sh
   supabase functions deploy create-order
   ```

   Its shared validation no longer imports the hardcoded catalog. The service-only `price_menu_cart` database function validates availability, deletion, size ownership and quantity, then returns the price snapshot. Existing Telegram and tracking functions need no change for this migration.
6. Build with `npm run build`, then deploy to Vercel with the existing frontend Supabase URL/anon key. Keep your exact Vercel origin in `ALLOWED_ORIGIN`. Deploy the new frontend and `create-order` together during a short maintenance window: old open browser tabs use the previous cart format and must refresh.
7. Visit `/admin`, sign in, and review the imported menu. Categories can be renamed and reordered using their Order fields. A category with any item (including soft-deleted items) cannot be deleted; reassign those rows first. Items support base prices or ordered sizes, image replacement, availability and soft deletion. Deleted items remain in the database and do not appear on the customer menu.

Owner uploads accept JPG/PNG/WebP up to 2 MB before compression, resize within 1000 px in the browser, and use unique Storage paths. The item and sizes save in one database transaction. Old images are deleted only after the item saves successfully; a cleanup failure is shown to the owner. Logos, the promotional banner and advertising artwork remain static branding assets; menu product images are stored in Supabase.

### Local checks

`npm run build` checks the frontend. `node scripts/test-menu.mjs` exercises the migration and menu pricing against an isolated PostgreSQL-compatible PGlite database, including role restrictions and order snapshots. It does not connect to or modify your Supabase project. Live Auth, Storage, Telegram and Realtime still require a configured staging project for end-to-end verification.

Assumptions: prices are positive whole PKR amounts; names uniquely identify categories and item names are unique within a category; editing a size preserves its UUID; removing a size invalidates carts that reference it. The owner creates admin accounts manually. No production credentials or deployment authorization are assumed.

## My Orders and delivery progress update

For this update, **do not edit or rerun `supabase/schema.sql`**. In the Supabase SQL Editor, open a new query, paste the complete contents of `supabase/migrations/202610310001_order_tracking.sql`, and run it. Apply this migration before deploying the updated functions/frontend. It preserves the existing order rows, adds missing timestamp columns, supports `preparing` alongside all existing statuses, and keeps customer name, phone and address inaccessible to anonymous tracking reads. Confirmation, departure and delivery timestamps are set by a database trigger when those status transitions occur. Old orders with no `confirmed_at` remain readable without an invented countdown.

From the project directory, redeploy all four functions:

```powershell
npx supabase functions deploy create-order
npx supabase functions deploy get-order
npx supabase functions deploy customer-respond
npx supabase functions deploy telegram-webhook --no-verify-jwt
```

Then run `npm run build` and redeploy the frontend (or refresh the local development site). The Telegram webhook still validates its secret header and rider chat ID. The configured URL and secret do not need to change. CORS OPTIONS responses use an empty 204 response.

Test the complete flow:

1. Place a new order. Open **Orders** in the navigation and find it under **My Orders**, then click **Track delivery**. Home and cart also show a small active-order bar. The history is limited to 20 orders on this browser and stores only UUID, placement time and subtotal; it does not recover orders placed before this feature existed.
2. Optionally click **Enable sound and alerts** on tracking and allow the browser prompt. Notifications require browser support and an open tracking page; they are not background push notifications.
3. In Telegram, accept the order, select a charge and ETA. The website shows **Your rider accepted your order**, the delivery charge, final total and ETA. Permitted browsers show a notification.
4. Confirm on the website. The countdown starts from the database confirmation time plus the rider's ETA. Check the same countdown on the My Orders card.
5. The rider receives a new message with the full order UUID, customer details, items, subtotal, delivery charge and total. Tap **Out for delivery**, then **Delivered**. The step bar updates, and the countdown stops. Tapping Delivered before Out for delivery asks the rider to follow that sequence. Existing callbacks cannot rewind completed orders.
6. Test cancellation on a separate quoted order. Also check a missing saved UUID shows **Order not found** and a Remove button. Temporary connection errors retain the saved card instead of treating it as deleted.

Realtime refreshes each order through its existing `order:<uuid>` topic; public broadcasts only trigger a trusted `get-order` fetch. The pages also refresh every 30 seconds while connected, or every 10 seconds when disconnected. The countdown displays “Rider is arriving soon” at zero and stops for terminal statuses. Phone numbers are shown plainly in Telegram so supported clients can recognize and tap them; client support varies.

Verification commands: `node scripts/test-order-progress.mjs`, `deno test --allow-env supabase/functions/_shared/cors_test.ts supabase/functions/_shared/order_progress_test.ts`, and `npm run build`. These tests use an isolated local database; the steps above verify your deployed Supabase/Telegram integration.
