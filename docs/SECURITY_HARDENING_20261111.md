# Security report follow-up and delivery service area

Reviewed and completed locally on 13 November 2026. The supplied HTML and text reports contain the same findings. Their claims were checked against the repository; no destructive probes, test orders, load tests or database changes were sent to production.

## Apply this update

1. The existing minimum-order/contact migration, `supabase/migrations/202611100001_restaurant_settings.sql`, is a prerequisite. If it has not been applied, apply it first using [its setup guide](RESTAURANT_SETTINGS.md). Do not rerun older migrations over newer ones.
2. In Supabase → SQL Editor → **New query**, paste and run the whole file `supabase/migrations/202611110001_delivery_request_security.sql`.
3. In another **New query**, run the whole file `supabase/migrations/202611110002_public_menu_privileges.sql`.
4. Deploy the four functions below from the project terminal. Confirm **Yes** if the CLI asks to deploy. Version 3.0.0 is pinned because it previously ran successfully on this Windows machine.

```powershell
npx supabase@3.0.0 functions deploy estimate-delivery --project-ref zsangbpeyefwovceierd
npx supabase@3.0.0 functions deploy create-order --project-ref zsangbpeyefwovceierd
npx supabase@3.0.0 functions deploy cancel-order --project-ref zsangbpeyefwovceierd
npx supabase@3.0.0 functions deploy customer-here --project-ref zsangbpeyefwovceierd
```

5. Commit and push the frontend changes to GitHub, then wait for the Vercel deployment to finish. The new response headers and real 404 responses require a Vercel deployment; Vite's development server does not apply `vercel.json`.
6. Open **Admin → Settings and alerts → Delivery service area**. Set **Maximum delivery radius (km)** and click **Save delivery area**. The migration initially uses **15 km**; choose your actual area before accepting new orders. Allowed values are 0.5–100 km with up to two decimal places. Rerunning these two migrations preserves your saved value.

Do not edit or rerun `supabase/schema.sql`. These migrations do not delete or reprice orders. New settings apply to new orders; retries of an already-created order return that same order.

**Secrets:** no new secrets or frontend environment variables are required. Keep `OPENROUTESERVICE_API_KEY`, `RESTAURANT_LAT`, `RESTAURANT_LNG` and `ALLOWED_ORIGIN` configured in Supabase. Supabase's service-role key remains on the server. Existing Telegram and push settings stay in place. No Telegram function deployment is needed for this update.

## Behavior and limits

- The service area is a **straight-line radius** from the server's restaurant coordinates. Road distance still determines the price using the owner's saved delivery-rate bands. An outside-area pin or resolved Maps link is rejected before an ORS call. `create-order` repeats the check, so bypassing the checkout page does not bypass the area restriction.
- Delivery checks use atomic fixed-window limits: **10 per minute and 100 per day per client hash**, plus **60 per minute in total**. Rate-limited responses return HTTP 429 with `Retry-After` and a safe message. Limits apply to requests with and without an Origin header, before following short Maps links.
- Client addresses come from gateway forwarding headers and are only a best-effort grouping key. They are HMAC-hashed on the server; raw IPs and customer contact details are not stored in the counters. Different users behind the same public IP may share a limit; requests lacking a valid IP share an `unknown` bucket. Spoofed headers cannot bypass the aggregate cap.
- Both estimate and checkout share an ORS budget of **30 calls per minute and 1,000 per day**. Beyond that budget, the existing Haversine × 1.3 fallback is used and checkout labels the distance **Approximate distance**. This can differ from a road route; the server still checks the reviewed delivery charge before saving. A missing API key remains an error. These are conservative app limits, not a statement of your ORS plan allowance.
- Old limiter buckets are removed in batches during successful delivery checks once their windows are older than two days. Cleanup is traffic-driven, not a guaranteed expiration timer. Buckets have RLS and no public access policies; only the two server RPCs have service-role execute permission.
- Limits reduce provider usage and expensive work; they do not eliminate Edge Function invocation costs or constitute complete DDoS protection. Shared limits can also affect legitimate users during an attack. Gateway protection/CAPTCHA can be evaluated separately if actual traffic warrants it.
- Radius changes appear in owner activity with readable Before/After values. Customer ordering hours, minimum food amount, restaurant phone, menu administration, rider actions and stored order totals continue using their existing flows.

## Findings disposition

| Finding | Result |
| --- | --- |
| F01: unbounded delivery checks and no delivery area | Added database-backed limits, shared provider budget, bounded request body and an admin-selected service area enforced by both endpoints. Optional route caching was not added. |
| F02: anonymous mutation grants | Explicitly removed anonymous menu/rate write grants and added restrictive admin-only mutation guards, including menu-image Storage writes. A 204 for a nonexistent row does **not** demonstrate that RLS allowed a real write; the report's write-exposure claim was not reproduced against live data. |
| F03: missing security headers | Added frame protection, MIME-sniffing protection, referrer/permissions policy and COOP. A minimal CSP is enforced; the full resource policy is **report-only** pending deployed browser checks. |
| F04: missing-order response | Cancellation and “I'm here” now return 404 for a missing valid UUID. Existing orders in a conflicting state still return 409. Only the ID is queried to distinguish these cases. |
| F05: missing manifest | Customer, owner and rider manifests already existed. Added one persistent manifest link, visible from initial HTML and switched by route without duplicate links, plus Apple Home Screen metadata and a visible iPhone hint when push is unavailable. Physical-device install/push testing is still required. |
| F06: CDN integrity | Added SHA-384 integrity and anonymous CORS to the pinned Remix Icon stylesheet. Removed the extra Font Awesome stylesheet. |
| F07: no-Origin requests | Kept intentionally. CORS controls browser access; it is not caller authentication. Server validation, RLS, checked RPCs and the new limits still apply. |
| F08: RPC signature hints | Retained public-schema RPC names used by the app. Signature metadata is not a privilege grant; authorization remains inside the functions and their execute grants. Moving every RPC would be a separate API migration and was not done. |
| F09: unknown paths return SPA HTML | Replaced the blanket rewrite with the app's supported routes and added a branded 404 page, robots.txt and homepage-only sitemap.xml. No source-file leak was established by an HTML response to a nonexistent file path. |
| F10: redundant icon library | Converted the remaining six Font Awesome icons to the existing Remix Icon library. |

The full CSP currently reports violations in browser developer tools; there is no configured report collection endpoint. Before enforcing it, check checkout maps, menu uploads and previews, Supabase calls, Realtime, notifications, fonts and installed apps on the deployed origin. `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'` are already enforced. Update the CSP's Supabase hostname and sitemap origin if you move to another project/domain.

Primary references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vercel project configuration](https://vercel.com/docs/project-configuration), [Vercel routing](https://vercel.com/docs/routing/rewrites), [WebKit Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [CSP frame ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Check after deployment

1. Sign in as an admin. Change the radius, save, reload, and verify it persists and appears in History and backups → Owner activity. Test menu editing, size prices and an image replacement. A normal account must be refused access to admin pages.
2. On checkout, choose a nearby pin and a nearby Maps link. Verify distance, delivery charge, minimum food amount and total. Try a point outside the saved radius; it should show the area message and prevent ordering. Reduce the radius and verify the same point is rejected; restore your chosen radius afterward.
3. Place one legitimate test order, retry the same submission if needed, accept it as a rider and complete delivery. It should appear only once, retain its totals, and remain trackable after changing the radius.
4. Cancel a pending test order. Confirm an accepted order still cannot be cancelled by the customer. A nonexistent UUID should show “Order not found.” Test “I'm here” on an arrived order as before.
5. Check Home, Cart, Orders, Tracking, Admin and Rider direct URLs. Unknown URLs and `/.env` should return 404, not the app's index HTML. Test only reads; do not run destructive probes against production.
6. In browser developer tools → Network, inspect the main page's response headers. Check the Console for report-only CSP violations while using maps, uploads and live order updates. Do not enforce the full CSP until legitimate dependencies have been verified.
7. On Android, install from Chrome; on iPhone, add from Safari's Share menu and open the Home Screen app. Verify customer, owner and rider names/start pages and enable alerts using their buttons. No notification permission should be requested on page load.

The abuse tests below are local and mocked. Do not flood the production app to test rate limits or consume the real routing quota.

## Local verification

```powershell
node scripts/test-delivery-security-db.mjs
node scripts/test-delivery.mjs
$env:DENO_DIR = Join-Path (Get-Location) '.deno-cache'
deno test --no-lock --node-modules-dir=none --allow-env --allow-read scripts/test-delivery-security-edge.ts scripts/test-minimum-order-edge.ts supabase/functions/create-order/protection_test.ts supabase/functions/estimate-delivery/routing_test.ts supabase/functions/_shared/cors_test.ts supabase/functions/_shared/maps_location_test.ts
npm run build
```

Database checks use an isolated PGlite database. Edge tests mock every fetch and use fake credentials. Browser checks in `scripts/test-restaurant-settings-browser.mjs` use the existing local Playwright setup, Chrome, and a dev server on port 5182; all Supabase and other external requests are mocked/blocked. They cover radius editing/recovery, admin access, mobile layout, role-specific manifests, an outside-area checkout response and the existing minimum-order/contact flow.

## SQL objects for review

Every new/replaced function, policy and index from the two migrations is printed in full in [SQL_REVIEW_20261111.md](SQL_REVIEW_20261111.md). Run the migration files themselves, in the order above. The radius uses the existing `restaurant_settings_read` and `restaurant_settings_admin_update` policies; its extra column grant is admin-restricted by that existing RLS policy. No new public order policy is created.
