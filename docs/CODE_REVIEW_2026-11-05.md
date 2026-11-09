# Code review — 5 November 2026

Scope: local customer checkout, admin/rider access and order operations, SQL migrations, tracking, Telegram/push, cleanup and deployment configuration. Review only; application code and production data were not changed. This is not a certification of the deployed Supabase configuration, dependency vulnerability status or hosted capacity. Browser/device flows were not rerun in this review.

## Findings in priority order

1. **High: map parsing can choose the wrong coordinates.** `supabase/functions/_shared/orders.ts:132` returns the URL @ coordinates before checking destination or embedded place coordinates. Local reproduction: `https://www.google.com/maps/dir/@24.88,67.0,12z?api=1&destination=26.0,63.0` returns 24.88,67 rather than the explicit destination 26,63. This affects distance, pricing and rider navigation. Prefer explicit destination/place coordinates; use map-centre coordinates only as an intentional fallback, and show the resolved location for review.

2. **High: food price changes bypass checkout total review.** `supabase/functions/create-order/index.ts:47` recalculates food prices, but line 52 compares only the delivery charge. If an admin changes a food price after the menu was loaded, the order is saved at the new food price even though the customer saw the old total. Include the reviewed food subtotal or price-version fingerprint in checkout and reject changes for review, while retaining authoritative server pricing.

3. **Medium: delivery calculation bypasses abuse protection.** `supabase/functions/estimate-delivery/index.ts:9` reads an unbounded JSON request and resolves Maps/OSRM requests without a rate gate. The guard added to create-order does not apply here. A caller can repeatedly use this endpoint without creating orders. Add bounded parsing and an endpoint-appropriate rate limit before external requests; application limits still do not prevent Edge invocation costs.

4. **Medium: no delivery service-area limit.** Coordinate validation accepts any valid worldwide coordinate, and the final price band covers every distance above its lower bound. The create-order flow does not reject geographically unserviceable destinations. Add an owner-configured maximum distance or delivery zone, validated by both delivery calculation and order creation. This is a business rule to decide before enforcing a particular radius.

5. **Medium: abandoned CSV-preparation snapshots do not expire automatically.** `supabase/migrations/202611040001_order_cleanup.sql:11` deletes expired batches only when another backup is prepared. Preparing a backup then abandoning the flow can leave full customer/order snapshots in the private database indefinitely. Add scheduled cleanup for expired batches; RLS currently prevents normal clients from reading them.

6. **Performance improvement:** all pages are eagerly imported in `src/App.jsx`, including rider/admin/map code. Build produces a 742.44 kB JavaScript bundle (217.73 kB gzip) with a chunk-size warning. Split routes with lazy loading so customers do not initially download the entire management application.

## Verification

All 15 non-browser Node test scripts passed: menu/security, admin reporting, delivery rules, checkout retry storage, alerts, order cleanup, order progress/protection, ordering hours, cancellation, riders and waiting alerts. All 9 Deno Edge Function tests passed. Production Vite build passed with the bundle warning above. Map coordinate precedence was reproduced locally without network access. A search found no service-role, Telegram-token or VAPID-private-key variable references in frontend source/public files; this is not an exhaustive secret scanner. Existing tests do not cover all findings above.

## Deployment unknowns

Did not inspect live database policies, applied migration history, deployed function versions, hosting HTTPS/domain settings or mobile push delivery. No production writes, external notifications, or live load tests were performed. Local concurrency simulations do not establish real Supabase capacity. CSV deletion intentionally removes contributions to live sales reports; that is the agreed behavior, not a newly discovered defect.
