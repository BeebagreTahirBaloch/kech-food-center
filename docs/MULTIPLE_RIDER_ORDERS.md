# Multiple nearby orders per rider

The rider can select several new orders and press **Accept selected**, or accept one additional order at a time. The default is **3 active orders**; **Admin → Settings and alerts → Multiple orders per rider** can set a limit of 1–5 and a distance of 0.1–10 km between delivery pins (default 1 km).

## Activate

1. Apply the two `20261107` migrations from OPERATIONS_SETUP_20261107.md first if not already installed.
2. In a NEW Supabase SQL Editor query, run the complete `supabase/migrations/202611080001_multiple_rider_orders.sql`. It is rerunnable. It replaces the old one-order unique index with a normal index; it does not delete or reset any orders. Do not rerun `supabase/schema.sql` or older migrations afterward.
3. Restart the local frontend or publish its new build (`npm run build`). Refresh rider/admin tabs. No Edge Function deployment or new secrets are needed for this update alone.
4. Adjust the capacity and nearby-distance settings as the owner. Existing assignments remain if the limit is lowered; the rider must finish enough orders before accepting more.

## Behaviour

- The server checks capacity and the distance between every pair of selected/existing delivery pins. This is a straight-line grouping limit, not road-routing distance or a delivery-price calculation. Check each map before accepting; nearby pins can have a longer road route. Checkout routing and saved delivery charges stay unchanged.
- Acceptance is one transaction using the same assignment lock as release/reassign. If any selected order was taken, is no longer pending, exceeds capacity or is too far away, none of that batch is accepted. Two devices cannot independently pass the capacity check and overfill the rider.
- Once a rider has marked an active delivery Arrived, they must finish it before adding another stop. No automatic acceptance is added.
- **My active orders** lists every assignment. Select a card to manage that customer's delivery time, navigation, call, arrival, cancellation or delivery. A mutation uses that card's UUID only. Completing one leaves the others visible. Payments, charges and customer tracking remain separate.
- Adding a stop does not invent a new ETA. Riders set the time for each accepted order and use **Update arrival estimate** if an added stop delays an existing delivery. Customer tracking/push uses those saved times.
- Uncertain save recovery checks all active orders. Batch requests are never automatically replayed. An old frontend can still use the single-order RPC; deploy and refresh the frontend so riders can see/manage all assignments.
- Admin reassignment allows an already-busy rider when capacity/proximity permit it. Failed reassignment keeps the original assignment. Public rider-availability warnings now consider available slots; they do not guarantee that a particular route will qualify.

## Tests

1. Set the limit to 3. Place three orders at nearby delivery locations, select all three and accept together. Check all three cards appear.
2. Set each order's delivery time. Mark one out for delivery and delivered; the other two must remain active. Cancel one and verify the remaining order and its price/time are untouched.
3. Try an order outside the distance limit, an order another rider just accepted, and more orders than the configured limit. Verify no partial batch is assigned.
4. Use two rider tabs/devices and try competing acceptance. Only one rider should receive each order and neither should exceed capacity.
5. Open the active-order cards on a phone, switch between them, and verify calls/navigation/cancellation use the selected customer's details.
6. As owner, change the limit to 5 and accept five nearby orders; lower it afterward and check existing orders remain. Check the activity log records the setting change.

Local automated checks use isolated PostgreSQL/PGlite and mocked Chrome, with no production orders. SQL tests cover 2, 3 and 5 assignments, migration reruns, all-or-nothing conflicts, capacity, pairwise distance, arrival blocking, independent status changes, reassignment, private helper permissions and audit records. Browser checks cover two/three-order selection and independent completion/cancellation. Multi-device testing should also be performed after deployment.

## SQL review

No new RLS policies: the existing `settings_admin` policy protects the new settings. No public customer/contact grants are added. The new index is `orders_active_rider`; `orders_one_active_rider` is removed. Functions are `rider_batch_check` (private), `accept_orders`, `accept_order`, `reassign_order`, `rider_dashboard`, `rider_availability`, and `audit_rider_capacity` (private trigger). Full definitions are in SQL_REVIEW_20261108.md.
