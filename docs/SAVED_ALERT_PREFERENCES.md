# Saved sound and notification preferences

This update is frontend-only. Publish the changes through GitHub/Vercel. No new SQL, RLS policies, indexes, database functions, Edge Function deployments or secrets are required. The existing push setup must already be configured.

## Customer behavior

- In tracking's Order alerts settings, enabling sound saves a boolean preference for this browser. It survives reloads and applies to future orders. Page-notification permission is requested only from the enable button, and only when the browser has not already decided.
- Browsers may suspend audio after a reload. A normal tap or key press anywhere in the site unlocks saved sound preferences. No repeated enable-button tap is needed. The site does not force autoplay, request permission on load, or play old status updates when audio unlocks.
- Push notifications remain a separate setting under Updates when you leave this page. After enabling them once, tracking reuses the existing browser subscription and securely registers subsequent active orders with the existing order-notifications function. The server still checks the order and browser ownership token. Only confirmed server registration is shown as Alerts on.
- Restoring alerts retries when the browser regains focus, comes online, or becomes visible. Denied permission is shown as Blocked in browser settings. Unsupported browsers retain in-page banners.
- Turning off sound and page alerts persists across visits; banners remain available. Turning off push removes this order's registration and stops automatic registration for future orders. Other already-enabled active orders retain their individual registrations; their tracking pages allow disabling those too.
- Existing customer registrations expire seven days after order creation. Completed orders receive no further updates. Changing browsers/devices or clearing site storage requires enabling again. When storage is blocked, preferences can last only for the current page session.

## Riders and owners

Rider sound has its own browser preference and a Turn off sound button. Existing rider and owner push registrations are checked on return. Granted notification permission is reused rather than requested again. Rider sign-out still removes the rider's push subscription to protect a shared device; signing back in after an explicit sign-out may require turning push alerts on again.

## Privacy

Only boolean choices are added to browser storage: kfc_customer_sound, kfc_customer_notifications, kfc_customer_push, and kfc_rider_sound. No customer name, phone, address, subscription keys or server secrets are added to localStorage. The existing browser ownership token and server registration authorization remain in place.

## Test

1. Open an active order's tracking page. Expand Order alerts and enable sound/page alerts and push once. Allow the browser prompt.
2. Reload. The saved settings should still be on, without another permission prompt. Tap anywhere once, then change the order status using the rider app. Expect one soft sound and the usual banner. Refreshing the same status must not repeat the alert.
3. Open another active order in this browser. Push should register automatically, with no second enable action.
4. Turn sound and push off, reload, and verify they stay off. New orders should no longer register automatically.
5. Enable rider sound, reload /rider, tap anywhere, and check that a new pending order produces a sound while the rider is online.
6. Verify with a real Android phone and an installed iPhone Home Screen app. Browser tests mock permission, sound and push APIs; they cannot certify OS-level notification delivery or audibility.

Automated check: with the local Vite server at http://127.0.0.1:5182, run `node scripts/test-alert-preferences-browser.mjs`. All remote requests and notifications are mocked; it never creates live orders or sends real alerts.
