> Current delivery pricing: use **Admin → Delivery rates**. New orders use the saved server-calculated charge, fixed at checkout. Riders select delivery time only. Older references below to suggested charges or rider-selected charges describe the previous flow. See **Admin-controlled delivery rates** below for deployment.

# Kech Food Center

Owner activity now shows the admin's login email and readable Before/After changes. Apply the [owner activity update](docs/OWNER_ACTIVITY.md) to resolve existing records too. No Edge Function deployment or new secrets are needed.

Riders can now select multiple nearby orders together: default 3 active orders, configurable from 1 to 5 by the owner. Follow [multiple-order setup and testing](docs/MULTIPLE_RIDER_ORDERS.md) for the new migration. Each delivery keeps separate customer details, payment, ETA and status controls.

Customer search, Order again, delay updates, customer/owner push alerts, monthly sales history, activity records and rider save recovery: follow [the latest setup steps](docs/OPERATIONS_SETUP_20261107.md). Kitchen controls are not included. [Backup and restore instructions](docs/BACKUP_AND_RESTORE.md) cover the database and menu images. [New SQL review](docs/SQL_REVIEW_20261107.md) reproduces the new policies, indexes and functions.

React + Vite + Supabase Auth, Edge Functions and Realtime, with a phone-first rider app and optional Telegram integration. Red/white design and Poppins are preserved.

## Deployment

Follow [the complete deployment guide](docs/DEPLOYMENT.md) for the new SQL files, function deploy commands, secrets, VAPID keys, Cron setup, Telegram switch and manual tests. Do not edit or rerun supabase/schema.sql on the existing project. [SQL review](docs/SQL_REVIEW.md) prints every new RLS policy, index and database function.

## Current flows

- Customer: choose food, select a pin or Maps link, review the estimate and send the order. Sending is confirmation. Only pending orders have a customer Cancel button. The rider accepts, sets final delivery charge and ETA, then marks out for delivery, arrived and delivered. /track/:id shows rider contact for that single order, countdown and alerts. I'm here is available once during the arrival wait. Home/cart show the saved active-order bar; /orders contains local history without private customer data.
- Rider: sign in at /rider using an owner-created account, go Online, enable sound/alerts and optionally install the app. New-order cards show delivery addresses to authorized riders while hiding names/phones. Accept one or select multiple nearby orders. SQL enforces the owner's active-order and distance limits. My active orders lists each assignment with separate controls. After arriving, record a call attempt and wait the configured time before cancelling for non-response. Delivered/cancelled orders free a slot immediately.
- Owner: /admin edits the menu, /admin/riders creates/manages riders and wait settings, /admin/orders shows final delivered sales, rider reports, cancellation details and CSV. Release/reassign requires a reason. Admin links are private; no public admin navigation.
- Telegram: all code remains. Missing TELEGRAM_ENABLED means off; only exact true enables it. The rider app works independently. Existing shared-chat orders remain supported; app-assigned orders cannot be overwritten by old Telegram callbacks.

## Delivery tiers

Delivery distances use openrouteservice driving-car routes through one shared server helper for checkout and order creation. The API key stays in Supabase Edge Function Secrets. During temporary service failures or quota limits, the existing Haversine x 1.3 fallback remains; checkout labels that distance as approximate. Missing/invalid keys and unroutable pins produce errors instead of silently guessing. Admin-defined distance ranges determine delivery prices (initial defaults: up to 5 km Rs.100, over 5 to 8 km Rs.150, over 8 km Rs.300). The server recalculates the price and locks it on new orders. Admin sales include delivered orders only, using their saved final delivery charge.

## Login sessions

Admin and rider sessions use separate browser storage keys and sign out locally. You can keep /admin and /rider open together without either role guard signing out the other account. After installing this fix, close older tabs, reopen the site and sign in once to each role. Two different rider accounts still need separate browser profiles. Customer requests use an anonymous, nonpersistent client.

## Run locally

Use Node 20.19+ or 22.12+. Copy .env.example to .env, supply public Supabase URL/anon key and restaurant coordinates, then `npm install` and `npm run dev`. `npm run build` creates dist. Vercel supports deep links through vercel.json. Only the VAPID public key belongs in VITE_VAPID_PUBLIC_KEY; no server secret belongs in a VITE_ variable.

Public signup stays off. Menu administration, Storage policies, price validation and immutable order snapshots remain in place. The old menu seed is local-only and uses a service key from a process environment variable; do not rerun the seed over an owner-edited menu. Historical first-install/menu setup instructions are archived in [PRE_RIDER_SETUP.md](docs/PRE_RIDER_SETUP.md); current deployment and order flow are in DEPLOYMENT.md.

Local checks cover tier boundaries, openrouteservice requests and fallback, privacy, migration reruns, rider ownership/assignment, arrival waits, release, final-price sales, Telegram switching and encrypted push request construction. Live mobile push and your configured Supabase/Telegram integration still need the deployment guide's device tests.

## Rider cancellation after acceptance

Run `supabase/migrations/202611010006_rider_cancel_after_accept.sql` in a new query. Deploy `get-order` and update the frontend. Cancel order is available for every accepted active order, with a reason and confirmation. Other requires a note. Customer not answering requires a recorded call; after arrival the existing wait (including the customer extension) still applies. Other reasons do not require arrival. Only the assigned active rider can cancel, completed orders cannot change, and cancellation frees the rider without counting a sale. No Reject button is added. This supersedes the earlier arrival-only cancellation UI.

### Pending-order cancellation repair

If customer cancellation returns "Unable to cancel the order", an older total/status constraint may still require a delivery charge on cancelled orders. Run `supabase/migrations/202611010007_pending_order_cancellation.sql` in a new SQL Editor query. It is safe to rerun and changes only the total/status check, without deleting orders or changing RLS. Then deploy `npx supabase functions deploy cancel-order` for clearer, privacy-safe server errors. No new secrets are required. Test cancelling a pending order before a rider accepts; accepted orders must still refuse customer cancellation.

### Customer ordering hours

Run `supabase/migrations/202611020001_ordering_hours.sql` in a NEW SQL Editor query, then deploy `npx supabase functions deploy create-order`. No secrets are needed. Refresh the frontend and open `/admin` → Customer ordering hours. Enable the limit, set daily opening and closing times, then Save. Times use Asia/Karachi; a closing time earlier than opening means the next day. Equal times are rejected; disable the limit for all-day ordering. The default is all-day ordering, so installing does not interrupt business.

Checkout shows the hours and disables sending while closed (refreshes every 15 seconds and on window focus). A database insert trigger enforces closing time even if a customer bypasses the page or leaves it open. Existing orders, rider actions and tracking continue normally. Public users can read only the safe schedule through `ordering_status()`; only admins can change the settings.

Test: enable hours containing the current Turbat time and place an order; set hours excluding the current time and verify checkout closes and a direct order request is refused. Verify an existing order can still be delivered. Try an overnight schedule, then disable the limit to restore all-day ordering.

### Stop or resume ordering immediately
Run `supabase/migrations/202611020002_stop_ordering.sql` after the ordering-hours migration, then redeploy `create-order` for updated closed-order wording. In `/admin`, use **Stop ordering** to save the pause immediately (no Save hours click needed). **Resume ordering** removes the pause and still respects the saved schedule. Existing orders and deliveries continue. No secrets, new policies or new indexes are required. Checkout refreshes status within 15 seconds; the database blocks new inserts immediately. Test pause with all-day ordering, verify checkout is blocked, then resume.

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

### Admin settings page
Customer ordering hours, Stop/Resume ordering, and delivery rates are now on `/admin/settings`. Open **Ordering and delivery settings** from any admin page. This page uses the same admin login and authorization guard. Saved settings are unchanged. No SQL, secrets or Edge Function deployments are needed for this page move.

### Rider pending-order addresses
Run `supabase/migrations/202611020005_rider_pending_address.sql` in a new SQL Editor query and refresh `/rider`. New-order cards now include the full delivery address before acceptance, through the active-rider-only `rider_dashboard` function. Customer names and phones remain excluded from pending cards. Public tracking and direct table permissions are unchanged. No Edge Function redeployments or new secrets are required.

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

### Maps destination correction (5 November 2026)
Deploy `create-order` and `estimate-delivery` after this parser update. No SQL or new secrets. Explicit destination/daddr coordinates take precedence; a single selected-place coordinate pair takes precedence over camera coordinates. Camera-only links (@, ll, center), unresolved destinations and ambiguous route links require a dropped pin. Existing orders are not rewritten. Test a shared place link and a directions link whose camera differs from its destination; test a camera-only link and verify it asks for a pin. Short links resolve on the server and every redirect must remain HTTPS on the allowed Google hosts.


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
