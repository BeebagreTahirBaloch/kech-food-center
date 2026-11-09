# Deploy the rider app and customer updates

For the latest customer/owner alerts and history update on an already configured project, use [the new setup guide](OPERATIONS_SETUP_20261107.md). It lists the two new migrations and four function deployments. Kitchen controls are not part of that update.

The code for Phases 1–7 is local. These steps apply it to the hosted project. Do not rerun or edit `supabase/schema.sql`. Keep existing orders; no migration bulk-deletes or resets them.

## 1. Run new SQL in order

In Supabase SQL Editor, open a NEW query for each whole file and run:

1. `supabase/migrations/202611010001_delivery_estimate.sql` (Phase 1; safe if already applied).
2. `supabase/migrations/202611010002_rider_operations.sql` (Phases 2–4: riders, one active order, release/reassign, arrival and cancellation).
3. `supabase/migrations/202611010003_rider_reports.sql` (admin reports).
4. `supabase/migrations/202611010004_rider_push.sql` (subscriptions and durable push queue).
5. `supabase/migrations/202611010005_push_schedule.sql` ONLY after Step 3 below creates the Vault entries.

The older menu/tracking/free-delivery migrations must already be installed. All new files can be run more than once. The partial unique index ignores old orders with no rider. Existing quoted/Telegram-only orders remain intact: use admin Release order to return an unfinished order to the rider queue, with a reason. No silent reassignment occurs.

Full policy/index/function definitions are printed in `docs/SQL_REVIEW.md`. Private order fields are NOT granted to the authenticated role: safe table RLS permits rider queue/own rows, and `rider_dashboard` returns full details only for assigned orders. This avoids leaking private columns through the customer's existing UUID policy. Calls and push subscriptions are inserted through checked RPCs, not direct browser inserts, so timestamps/ownership cannot be forged. `customer_here` is service-only and reached through the single-UUID Edge Function. No new public rider list exists.

## 2. Auth and secrets

Leave Authentication → Sign In / Providers → Allow new users to sign up OFF. Existing owner must be in `public.admins`. Create riders at `/admin/riders`, not through public signup. Disable riders there; release their active orders separately with an audit reason if needed. Do not add a rider to admins. Wrong-role pages sign out with Not authorized.

Existing server secrets remain: RESTAURANT_LAT, RESTAURANT_LNG, ALLOWED_ORIGIN, TELEGRAM_BOT_TOKEN, TELEGRAM_RIDER_CHAT_ID, TELEGRAM_WEBHOOK_SECRET. Supabase supplies SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY on the server. No service key belongs in Vercel frontend variables.

Generate VAPID keys locally (do not paste private keys into this repository):

```powershell
npx web-push generate-vapid-keys
```

Set these in Supabase Edge Function Secrets (dashboard recommended so secrets do not enter shell history):

- `VAPID_PUBLIC_KEY`: generated public key.
- `VAPID_PRIVATE_KEY`: generated private key, server only.
- `VAPID_SUBJECT`: `mailto:` followed by the owner's monitored email address.
- `PUSH_CRON_SECRET`: a long random secret (at least 32 random bytes).
- `TELEGRAM_ENABLED`: `false` for rider-app-only operation, or exact `true` to enable Telegram. Missing, uppercase and other values mean off.

In Vercel keep VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_RESTAURANT_LAT/LNG and add **only** `VITE_VAPID_PUBLIC_KEY` with the same public key. Redeploy after changing Vite variables. HTTPS is required for installed-app push; localhost is useful for testing.

## 3. Schedule the durable worker

In Supabase Vault create two named secrets:

- `kfc_supabase_url`: the project URL, without a trailing slash.
- `kfc_push_cron_secret`: exactly the same value as server `PUSH_CRON_SECRET`.

Then run `202611010005_push_schedule.sql`. It installs/enables pg_cron and pg_net and replaces only the job named `kfc-rider-push-worker`. It does not print decrypted secrets. Confirm the job appears in Supabase Cron and runs every minute.

New orders enqueue an immediate push and one reminder due after 2 minutes. create-order starts the worker immediately, and Cron supplies recovery and reminders. Reminders normally run 2–3 minutes after creation, depending on the minute boundary. Each job checks that the order is still pending. Queue claims use SKIP LOCKED, a 5-minute retry lease and at most 3 attempts. Provider-level exactly-once delivery is impossible after a network failure: tags collapse retry notifications, but transient failures can delay a reminder. Inspect `order_push_jobs` as admin in the dashboard for jobs with attempts=3 and finished_at IS NULL. Do not expose this table to clients.

## 4. Deploy Edge Functions and frontend

From the project directory:

```powershell
npx supabase functions deploy estimate-delivery
npx supabase functions deploy create-order
npx supabase functions deploy get-order
npx supabase functions deploy cancel-order
npx supabase functions deploy customer-here
npx supabase functions deploy admin-create-rider
npx supabase functions deploy customer-respond
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy rider-push --no-verify-jwt
npm run build
```

`rider-push` validates either a rider JWT itself or the scheduled worker secret. `admin-create-rider` checks the caller's JWT and is_admin before any service-role operation. `telegram-webhook` checks Telegram's secret header even when Telegram is off, then returns an empty 200 without processing. Browser OPTIONS replies remain bodyless 204 responses.

Deploy `dist` through the existing Vercel setup. `vercel.json` keeps SPA routing and sets the worker/manifest headers. The service worker is registered only on signed-in rider pages with scope `/rider`. It caches no customer data or API responses. Order operations need a network connection; offline navigation shows a reconnect message.

## Turn Telegram on or off

```powershell
npx supabase secrets set TELEGRAM_ENABLED=false
# To turn it back on:
npx supabase secrets set TELEGRAM_ENABLED=true
```

After changing it, redeploy create-order, customer-respond, cancel-order, admin-create-rider, rider-push and telegram-webhook (the last two with --no-verify-jwt). Keep all existing bot secrets. Telegram code and legacy controls are retained. `/admin` shows the on/off value via an admin-checked endpoint; no secret is exposed.

When off, checkout never contacts Telegram and writes no Telegram failure. When on, the original unassigned Telegram flow remains usable. Once an order belongs to an app rider, stale Telegram callbacks cannot overwrite that rider's work. No public rider account is inferred from the old shared Telegram chat. An owner can release a legacy order through the admin page when moving it to an app rider.

## 5. End-to-end tests (use test orders)

1. Owner: sign into /admin/riders; create two riders, edit, disable/re-enable one and reset a password. Verify wrong-role access at /admin and /rider is rejected. Check normal customers cannot list riders or private orders.
2. Checkout: pin and Maps-link estimates, failed-link tier fallback, boundary rates 5 km=100 and 8 km=150. Submit; saved estimate is computed server-side. Cancel only while pending. Keep tracking open and enable sound/alerts.
3. Rider A: go Online and enable sound. See the new order without customer name/phone/address. Use separate browser profiles for riders A and B (Supabase sessions are shared across tabs). Rider B tries the same order: only one succeeds. After acceptance, A sees customer contact/address/navigation. A cannot accept a second active order. B cannot modify A's order through RPCs.
4. Set final charge/time. Tracking automatically confirms and shows rider name/phone, estimate versus final, countdown and alerts. No customer-confirm button. Mark Out for delivery, then Delivered; A can accept another order immediately. Admin sales include final delivery charge, not the estimate.
5. Release an active order as admin with a reason. Customer sees Finding you another rider without old contact details. Test reassigning to a free active rider and refusal when that rider already has an active order. Audit events remain visible in details.
6. Arrival/cancel: mark Out for delivery, I've arrived, Call customer. Cancellation is locked until the server wait has elapsed. Customer can tap I'm here once within the original wait, restarting it. Test early cancellation rejection, missing-call rejection, Other requiring a note, and successful no_answer cancellation after waiting. Rider becomes available. Customer sees the rider-cancel explanation. Admin filter/CSV contains arrival, calls, reason/note and cancellation actor. Cancelled orders add no sales. Default wait 10 minutes and warning 20%; owner can edit at /admin/riders.
7. Push: install /rider, tap Turn on order alerts, permit notifications and Send test alert. Keep rider Online, close the app, place an order and check a minimal notification opens New orders. Leave an order pending for 2–3 minutes to test one reminder; accept before then to suppress it. Test Offline rider receives no new-order push and expired subscriptions are removed. Real Android/iPhone tests are required; OS power/network settings affect delivery time.
8. Telegram off: place, accept, quote, deliver and cancel entirely in /rider without any Telegram dependency. Turn it on and verify the old shared-chat flow with a separate unassigned order.
9. Customer alerts: verify accepted/on-the-way/arrived/delivered/cancelled banners, one toast/tone per observed event, background tab title, permission-denied fallback, and Reconnecting/polling. Return home/cart: active bar appears for saved active orders and disappears when finished. Browser storage contains only UUID/time/subtotal, not customer details.

## Privacy and operational limits

Push payloads contain a generic order alert, opaque order tag and /rider URL; no customer name, phone, address or items. The browser push provider sees subscription/delivery metadata. Only active riders manage their own subscriptions; sign-out removes that browser subscription and sets Offline. Keep VAPID private keys, cron secret and bot credentials server-side. Rotate keys only with a plan to resubscribe devices. Unsupported push providers are rejected rather than fetched as arbitrary URLs.

A call-attempt entry records a tap, not a verified completed phone call. Server time controls cancellation and never trusts the phone clock. App sound/vibration/wake lock are best-effort browser features; no permission is requested on page load. Public tracking retains the existing bearer-UUID single-order access model. Do not publish tracking URLs.

## Local verification

```powershell
node scripts/test-delivery.mjs
node scripts/test-order-progress.mjs
node scripts/test-order-alerts.mjs
node scripts/test-admin-orders.mjs
node scripts/test-riders.mjs
npm run build
```

Deno checks/tests use the npm Web Push package (pinned) with Node compatibility. On Windows, use a writable DENO_DIR; `DENO_NO_PACKAGE_JSON=1` plus `--no-config --node-modules-dir=none` isolates Edge Function dependencies from Vite's node_modules. Tests in `_shared/rider_push_test.ts` mock fetch and send no real notifications. The browser test uses a local-only Playwright install in .test-tools and mocked Supabase responses; it does not replace live Auth/Realtime/Telegram/PWA verification.

References: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Web Push library](https://github.com/web-push-libs/web-push).

### Admin-controlled delivery rates

Run `supabase/migrations/202611020003_admin_delivery_rates.sql` in a NEW SQL Editor query after prior migrations. Safe to rerun; do not rerun older charge/total migrations afterward. No secrets are added. Default rates remain up to 5 km Rs.100, over 5 to 8 km Rs.150, over 8 km Rs.300. `/admin` now edits both distance boundaries and all three charges. Rates can be zero for free delivery. Boundary distances are inclusive; the final band covers everything above the second boundary. Only admins can update rates; public access reads pricing only.

Deploy after SQL (then refresh/redeploy the frontend):
```powershell
npx supabase functions deploy estimate-delivery
npx supabase functions deploy create-order
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy rider-push --no-verify-jwt
```

Checkout resolves both pins and Google Maps links on the server using the openrouteservice driving routes (with a labelled Haversine fallback during outages). It shows **Delivery charge** and **Total** and requires a calculated charge before ordering. `create-order` recomputes distance and price; the browser's charge is only compared, never trusted. If the current rate differs from the reviewed price, submission is refused and the customer must review the refreshed price and send again. The insert trigger rechecks the rate, covering a concurrent admin price change. Existing orders keep their snapshots. New locked charges survive cancellation, release and reassignment. Riders select the ETA only; even old rider clients cannot override price through `set_quote`. Telegram acceptance goes directly to ETA selection. Legacy orders retain previously selected charges (or their original estimated charge if they had no final charge).

Test: change a rate in admin, choose a checkout location, verify the total includes it, place an order, accept as rider, select time, deliver, and check sales. Change rates after placing an order and verify that order's charge stays unchanged. Try free delivery, distances at both boundaries, a bad map link, a rate change before Send order, and a normal user's attempt to edit rates. `node scripts/test-admin-delivery-rates.mjs` covers database permissions, boundary rates, migration reruns, existing rows, tampered fees, rider override, release/reassignment pricing and delivered totals.

### Flexible delivery ranges
Run `supabase/migrations/202611020004_flexible_delivery_rates.sql` after `202611020003_admin_delivery_rates.sql`, in a NEW SQL Editor query. It converts your current saved distances and prices without resetting them; reruns preserve edited ranges. No Edge Function redeployment or new secrets are required for this update (the functions from the previous delivery-rates setup must already be deployed). Refresh the frontend.

In `/admin` → Delivery rates, use **+ Add range** and **Remove range** to have one, two, four or more price bands. Each limit must be greater than the previous one. The final band always covers all remaining distances and cannot itself be removed; remove bounded rows to reduce the number of bands. Save all changes together using **Save delivery rates**. Existing orders keep their saved charges. Customer rate cards display the saved list.

Test two bands and four bands, then place orders at locations in different ranges. Verify each boundary includes its upper distance, invalid/repeated limits cannot save, and existing orders retain their original total. `node scripts/test-flexible-delivery-rates.mjs` checks these database rules, permission enforcement and safe reruns.

### Order request protection and bounded load tests

Run `supabase/migrations/202611030001_order_protection.sql` in a NEW SQL Editor query, then deploy `npx supabase functions deploy create-order` and refresh/redeploy the frontend. No new secrets are required. Old open tabs must refresh because new submissions require a checkout reference. Existing orders and tracking remain unchanged.

The database uses atomic token buckets: 30 requests may arrive as a burst across the project, replenishing at 2 per second. Each phone has a 5-attempt burst replenishing at 1 per minute. These are token-bucket limits, not fixed calendar-minute caps. The global gate runs before map resolution, menu pricing, route calculation and notifications. Retries still use the global gate but completed/in-progress retries do not consume the phone allowance. Excess calls return HTTP 429 with Retry-After; busy duplicate submissions return 409 with a retry delay. Failed protection storage returns 503 (no unprotected order). Requests are bounded to 32 KB. No assumption is made that caller-provided forwarding headers identify a trustworthy IP address. Phone normalization covers common Pakistan formats; phone numbers are not verified identities. Rotating phone values cannot bypass the global bucket.

Duplicate protection: sessionStorage holds only a random UUID and SHA-256 request fingerprint, never raw customer name, phone or address. If storage is blocked, memory preserves retries in that tab. Successful completion clears the reference. A changed payload is treated as a new checkout. Server request keys and body fingerprints are private, with a unique orders index preventing duplicate insertion even after a worker lease expires. Completed retries return only id, time and subtotal and do not repeat notification sends. A 90-second processing lease can be retried after a worker crash; completed orders are found immediately. Notification delivery remains best effort: a crash after saving an order but before Telegram is sent can leave the alert missing, while the order remains visible in the rider app. No raw phone is stored in limiter buckets: the server HMAC-hashes it with the existing service key. Rotating that key resets phone bucket identity but does not affect checkout fingerprints or old orders. Stale buckets and uncompleted request keys are cleaned in bounded batches after a day; completed keys remain while their order exists.

This protects order creation, not all site endpoints, and is not a DDoS shield. Requests still invoke the Edge Function and hit the database gate. Sustained attacks can consume invocation/database quotas, and a global limit can temporarily reject genuine customers. Supabase's rate-limit guide also treats rate limiting as explicit application logic: https://supabase.com/docs/guides/functions/examples/rate-limiting . A dedicated edge/WAF layer is separate future work.

Local checks (no network, production credentials or real notifications):
```powershell
node scripts/test-order-protection.mjs
node scripts/test-checkout-request.mjs
node scripts/load-test-orders-local.mjs
```
The report is `.test-results/order-load-report.json`. The local embedded PostgreSQL simulation verifies admission limits and duplicate behavior with concurrent promises; it serializes database work and does NOT establish hosted Supabase, route-provider or HTTP capacity.

For actual hosted throughput, create a separate staging Supabase project and deploy the same migrations/functions. Turn TELEGRAM_ENABLED=false there, do not copy live riders or push subscriptions, leave all riders offline, and seed only fake menu/order data. Do not run a load test on production. Prepare an untracked local JSON fixture with `items` (staging itemId/sizeId/quantity), `deliveryLocation` (test lat/lng) and `deliveryCharge` calculated by staging estimate-delivery. Use only the staging anon/publishable key. The staging script refuses the known production project and any host not matching the explicit staging reference.

Set these only in the local test terminal, then run:
```powershell
$env:LOAD_TEST_PROJECT_REF = 'YOUR_SEPARATE_STAGING_REF'
$env:LOAD_TEST_URL = 'https://YOUR_SEPARATE_STAGING_REF.supabase.co/functions/v1/create-order'
$env:LOAD_TEST_ANON_KEY = 'STAGING_ANON_OR_PUBLISHABLE_KEY'
$env:LOAD_TEST_FIXTURE = 'load-test-fixture.json'
$env:LOAD_TEST_ISOLATED = 'true'
$env:LOAD_TEST_NOTIFICATIONS_DISABLED = 'true'
$env:LOAD_TEST_COUNT = '10'
node scripts/load-test-orders-staging.mjs
```
Review results before increasing to 20. Optionally set LOAD_TEST_MODE=duplicate for same-request concurrency, or count=100 for a bounded burst. Wait for rate buckets to refill between tests (at least 60 seconds). The script sends at most 100 requests, has a 30-second client deadline and aborts outstanding client requests on a server error. Requests already accepted by the server may still complete. It never deletes orders. Results are `.test-results/order-staging-report.json`, with status counts, unique orders and p95 latency but no customer data or keys. This real staging test has NOT been run here because no isolated hosted test project was provided and Docker/PostgreSQL CLI are unavailable.

Manual smoke test after deployment: place one order, verify rider/tracking; retry the same request id/payload and confirm the same order id; retry a changed payload with the same id and confirm rejection; test rate limiting only locally or in isolated staging. Keep SQL rollout before deploying the updated function and frontend. To roll back application code, the additive tables/index can remain; do not delete production orders or rerun schema.sql.

### Busy riders and waiting-order alerts
Run `supabase/migrations/202611030002_waiting_order_alerts.sql` in a NEW SQL Editor query, then refresh the frontend. No new secrets or Edge Function deployments are needed. Existing order, rider and public tracking policies are unchanged.

Checkout polls the safe `rider_availability()` boolean every 15 seconds and on focus. When there is at least one active online rider and all such riders have an active order, it shows **All riders are busy. Your order may take longer.** Orders remain allowed. An offline or inactive rider is not treated as available. No online riders is not labelled all busy and does not automatically close ordering in this change.

Every logged-in admin page shows an overdue-order panel (Realtime plus 30-second polling, including passage of time). Default alert threshold: 10 minutes. Change it at `/admin/settings` → Waiting-order alerts (1–120 minutes). It considers only pending, unassigned orders, and resets waiting time when an order is released for reassignment. The alert ignores the Orders and sales date/search filters and shows the oldest 20 with the total count. View order links to the matching admin report row. Cancel order requires a reason and confirmation; the checked function refuses if a rider accepted first, records the admin and reason in order_events, and triggers normal tracking updates. Orders are never automatically cancelled.

These are in-page alerts only: keep an admin page open. No Telegram, system notifications, email or closed-browser admin push is added. The default was chosen pending the owner's preference; Telegram admin alerts would require a separate admin chat destination.

Test with two online riders: give both active orders and verify the cart warning while checkout remains allowed. Finish one delivery and verify the warning disappears on refresh. Set a 1-minute alert threshold temporarily, place a pending order, and keep any admin page open for up to 90 seconds. Verify the alert and View order link. Accept the order and verify the alert clears; attempt cancelling an already-accepted order and verify refusal. Cancel a separate pending order as admin and verify customer tracking and the recorded reason. Restore the desired threshold after testing.

### Delete old orders
Run `supabase/migrations/202611040001_order_cleanup.sql` in a NEW SQL Editor query, then refresh `/admin/settings`. No Edge Function deploy or secrets are required. Choose 6, 12 (default), or 24 months. Export CSV, check that it saved, then use the yellow warning button. First confirm the count/date, then type DELETE for the final confirmation. The browser cannot verify a download itself: the owner must check the saved file. Each batch includes at most 500 old delivered/cancelled orders; repeat for larger archives. Preparation expires after one hour. Pending/active/recently completed orders are excluded. Existing reports lose deleted orders and tracking links stop working. CSV includes all order columns plus call attempts and order events as JSON columns; it is not an automatic database restore. No monthly-sales archive is created.
Deletion is a single admin-checked transaction bound to the exporting admin and exact backed-up order rows. Changed rows abort the entire operation. Related call attempts, events and push jobs are removed first. Temporary overlapping backup batches are removed after deletion. No production records were deleted during implementation. Test in staging with fake old completed orders before using it on real data.


## Openrouteservice delivery routing (2026-11-05)

No SQL is required. There are no new tables, RLS policies, indexes or database functions; do not run schema.sql. Existing order distances and charges are not rewritten.

1. Create a free Standard API key in the [HeiGIT/openrouteservice account dashboard](https://account.heigit.org/). This is **openrouteservice**, not the similarly named OpenRouter AI service.
2. In Supabase -> Edge Functions -> Secrets, add `OPENROUTESERVICE_API_KEY` with that key. Use the dashboard so the key stays out of terminal history. Never add it to a `VITE_` variable, source code, screenshots or chat. Do not put it in Vault; this key is read by Edge Functions.
3. Check existing `RESTAURANT_LAT` and `RESTAURANT_LNG` secrets: they must be the restaurant's actual pin and match the frontend `VITE_RESTAURANT_LAT` and `VITE_RESTAURANT_LNG`. Changing the routing provider cannot fix a wrong origin.
4. From the project folder deploy both functions:

```powershell
npx supabase functions deploy estimate-delivery
npx supabase functions deploy create-order
npm run build
```

Refresh the local site (or publish the rebuilt frontend to your hosting). Neither Telegram nor tracking functions need redeployment for this change.

Both functions use POST `https://api.heigit.org/openrouteservice/v2/directions/driving-car/json`, fastest driving route, longitude/latitude coordinate pairs, metres converted to kilometres rounded to one decimal. Only coordinates and routing options go to the provider, never customer names, phone numbers or address text. The key is sent in an Authorization header to the fixed HTTPS API host; redirects are refused. Provider response bodies, coordinates and keys are not logged. Checkout includes provider/data attribution.

The request timeout is eight seconds. Network failures, timeouts, HTTP 429/408/5xx and invalid response shapes fall back to Haversine x 1.3. Checkout then says **Approximate distance** and explains that road routing is unavailable. This fallback is not a measured road route and may be less accurate. Missing or rejected credentials fail with a safe configuration message; other 4xx/no-route errors ask the customer to check the pin. No automatic retries are made against the provider. The server recomputes the charge at submission; if it differs from the reviewed checkout charge, the existing review-and-resend flow is preserved.

The Standard allowance is currently 2,000 directions requests/day and 40/minute; verify the [current plan](https://account.heigit.org/info/plans). Checkout, pin changes, manual refresh and order submission can each consume requests, so orders are not the same as requests. The order-creation rate limit does not protect the estimate endpoint; this integration is not a provider-quota or DDoS guarantee. Monitor API usage in the provider dashboard.

Test after setting the key and deploying:
- Choose a pin at checkout: confirm **Road distance**, the openrouteservice credit, and the correct admin-set charge/total. Test a shared Google Maps location link as well.
- Compare 5-10 local destinations against Google Maps using identical restaurant and delivery pins. Different map data/routing can still produce different routes; do not assume exact Google parity.
- Place one test order. Verify its saved distance/fee and complete the rider/tracking flow. Existing order snapshots should remain unchanged.
- In isolated staging with mocked routing failures, verify **Approximate distance**, retry behavior, and that a fee change requires customer review. Do not exhaust the production quota to test fallback.

Local verification: `node scripts/test-delivery.mjs`, Deno routing/estimate/create-order integration tests with all external requests mocked, and `npm run build`. Real Turbat route accuracy requires your API key and the above live comparisons.


### Verified restaurant pin

The owner-provided [restaurant Maps link](https://maps.app.goo.gl/wBr77RPnFvDHybiG9) identifies KFC Keech Food Center at **26.0055083, 63.0600925** (selected-place coordinates, not the map camera). The frontend `.env`, `.env.example` and fallback map centre use that pin. In Supabase Edge Function Secrets, independently verify/set `RESTAURANT_LAT=26.0055083` and `RESTAURANT_LNG=63.0600925`; local Vite variables do not configure the backend origin. Restart Vite after changing local `.env`; update the VITE coordinates on your frontend host and rebuild if hosted. This does not rewrite existing orders.

For the supplied supermarket link, the selected destination is **25.995303, 63.0317878**. Compare routes with these exact two endpoints. ORS driving routes can still differ from Google because they use different road data and routing. Do not scale a real road distance simply to force one example to match. No SQL is needed for a coordinate correction.


### Routing API address update

Use the supported `https://api.heigit.org/openrouteservice/v2/directions/driving-car/json` endpoint. The provider [deprecated the old api.openrouteservice.org host](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912); the existing key and request format still apply. Redeploy `estimate-delivery` and `create-order` after this update. No new secrets or SQL. This compatibility update does not guarantee that the provider will return the same route or distance as Google Maps.
