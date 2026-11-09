# Customer, owner and rider updates — 7 November 2026

Implemented locally. Apply the SQL before deploying the functions/frontend. Existing orders keep their status names, price snapshots and rider ownership. Sending an order is still the customer's confirmation.

## 1. New SQL queries

Open a NEW Supabase SQL Editor query for each complete file, in this order:

1. `supabase/migrations/202611070001_customer_history.sql`
2. `supabase/migrations/202611070002_customer_owner_alerts.sql`

Both are rerunnable. Do not edit or rerun `supabase/schema.sql`. Full policies, indexes and database function definitions are reproduced in `docs/SQL_REVIEW_20261107.md`.

## 2. Deploy

```powershell
npx supabase functions deploy get-order
npx supabase functions deploy create-order
npx supabase functions deploy rider-push --no-verify-jwt
npx supabase functions deploy order-notifications --no-verify-jwt
npm run build
```

Publish the built frontend to your hosting, or restart the local development server. HTTPS (or localhost) is required for service workers. Vercel worker/manifest headers are included. No changes to Telegram configuration are required.

## 3. Secrets and scheduling

No new Edge secrets are required if rider push already works. Reuse server `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_CRON_SECRET`, and frontend **only** `VITE_VAPID_PUBLIC_KEY`. The frontend public key must match the server public key. No service key, private VAPID key, notification endpoint or customer detail is published in frontend environment variables.

Verify Supabase Cron still runs the existing `kfc-rider-push-worker` every minute. Its `rider-push` endpoint now drains rider, owner and customer jobs. If that job was never installed, follow `202611010005_push_schedule.sql` and its existing Vault setup instructions in DEPLOYMENT.md; this is not a new secret scheme. Public `order-notifications` validates one order UUID, browser capability and subscription; its owner test action independently verifies the owner's login and admin membership.

## 4. Customer features

- Home menu search matches names/descriptions; empty results and clearing search are supported. The homepage active-order bar is removed, following the earlier preference; cart tracking remains.
- `/orders` has **Order again**. Available products/sizes are merged into the current cart, using current catalogue prices. Unavailable/deleted products and sizes are listed in the cart message. It does not store names, phones or addresses. Modern checkout submits its reviewed food subtotal; a changed food price requires review/resubmission before an order is inserted. Older checkout clients remain compatible.
- Expired arrival estimates say **Taking longer than estimated**, with a call link. Pending orders show elapsed waiting time and no-rider/all-busy warnings. Arrived/delivered/cancelled orders stop the countdown. The assigned rider can set a revised absolute arrival estimate; it does not reset confirmation or change delivery prices.
- On `/track/:id`, choose **Notify me about this order**. Permission is never requested on page load. The button also turns this order's push off. Denied/unsupported push leaves the existing in-page alerts available. Notifications show only generic status messages and a tracking link.
- Android: Chrome menu → Add to Home screen → Install, then enable alerts. iPhone: Safari → Share → Add to Home Screen, open the installed app, then enable alerts. Browser/device settings and internet access still govern delivery.

## 5. Owner

- `/admin/settings` → **Owner notifications**: enable alerts and send a test. Alerts cover new orders, pending orders waiting beyond the saved threshold, and accepted orders without progress. The latter threshold defaults to 20 minutes and does not alert before the current arrival estimate. Alerts are opt-in, generic and checked against current order progress before sending. No automatic cancellation is added.
- `/admin/history` shows monthly live-plus-archived totals and owner activity. Archived totals are recorded transactionally when a completed order is deleted after this update. Sales include delivered orders only, using saved food/final delivery charges. The existing filtered Orders and sales report continues reporting retained detailed orders; the new history page is the long-term totals view. Previously deleted orders cannot be reconstructed.
- Activity records the actor UUID, timestamp, table/action and selected before/after values for menu, sizes, categories, rates, hours, delivery settings and rider account changes. It excludes phones, addresses, credentials and subscription keys. SQL Editor/service changes appear as server changes when no authenticated actor is available. ETA actions also appear in existing order events.
- Signing out removes that owner's alert subscription from this device while keeping other customer subscriptions intact. Reconnect if sign-out cannot remove the device registration.

## 6. Rider save/reconnection behaviour

The rider page shows browser connectivity, last successful server refresh, and **Saving**, **Saved — server confirmed**, or **Save not confirmed**. Failed refreshes leave visible data marked potentially stale. After an uncertain action, the next successful snapshot is checked against that action/order before confirming success. There is no automatic replay of acceptance, cancellation or delivery actions. No private customer data is cached to disk for offline use. A fresh reload while completely offline still needs reconnection; this update provides safe refresh/reconciliation rather than offline ordering or delivery completion.

## 7. Backup process

Follow `docs/BACKUP_AND_RESTORE.md` for database dumps, menu-image downloads, checksums, a local-only restore tool and verification. Backup credentials are local environment variables, never frontend secrets. A real restore drill needs Docker/Supabase CLI/PostgreSQL tools; Docker and PostgreSQL tools are unavailable in this development environment, so no live backup or full database restore has been claimed.

## 8. Tests to perform after deployment

1. Search food; order again from an older order. Change a menu price or mark an item sold out, then verify the cart uses today's data and explains omissions.
2. Place a test order and verify the existing order, rider acceptance and delivery flow remain unchanged.
3. Accept the order and set ETA. Revise it from the rider page, verify the new arrival time and contact link. In staging set an elapsed ETA and verify the delay wording; show no-rider warning with all riders offline.
4. Enable customer alerts, close the tracking tab, and move the order through acceptance, dispatch, arrival, delivered/cancelled. Enable owner alerts, close admin tabs, place another order and test waiting/stalled thresholds. Check Cron and `notification_jobs` as owner in Supabase if delivery fails. Failed jobs retry up to five times with a two-minute lease. Device notifications use stable tags to collapse transport retries; exactly-once browser delivery cannot be guaranteed.
5. As a rider, simulate a failed save/connection loss. Verify no optimistic Delivered state appears. Reconnect and refresh; verify confirmed server state is shown and a mutation is not silently repeated.
6. As a normal customer/rider, attempt `/admin/history`; access must be refused. Public tracking must exclude customer name/phone/address, activity and subscriptions.
7. In isolated staging, delete an eligible old completed order through the existing export/two-confirmation flow. Verify monthly history totals remain unchanged and detailed tracking disappears as before. Run the backup fixture tests and the separate local restore drill before relying on recovery.

In-page Realtime remains immediate; closed-page push can wait for the next one-minute worker tick or longer when jobs are queued. Disconnected phones, browser restrictions and provider failures can delay it. Expired customer registrations (seven days), completed notification jobs (seven days), and abandoned CSV preparations (one hour) are cleaned by the worker. No public list of customer orders or subscribers is introduced.

## Local checks completed

Production build; rerunnable migrations in isolated PostgreSQL/PGlite; admin/customer/rider permissions; archived sales totals; owner audit attribution and subscription ownership; current-price reorder and menu-change checkout rejection; notification privacy, endpoint checks and CORS; existing menu/order/Telegram protection tests; backup traversal/checksum/count fixtures. Mocked Chrome tests cover 390 px mobile layouts, search, reorder omissions, delayed tracking, offline save reconciliation and owner-page access denial. No real customer orders or device pushes were sent during these checks. Live push delivery and a complete backup restore still need the deployment tests above.
