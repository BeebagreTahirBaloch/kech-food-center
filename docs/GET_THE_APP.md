# Customer app installation

The customer site now links to `/get-app` from desktop navigation, the mobile bottom bar and the footer. The page uses the existing customer manifest, icons and notification service worker. Installation links disappear when running in standalone mode or after the current browser reports a completed installation. There is no APK download, store listing or automatic installation.

The install event is captured on customer pages and kept across React Router navigation. Clicking **Install app** opens the browser prompt when available. Dismissed or failed prompts show manual instructions; only `appinstalled` or standalone display mode confirms installation. Normal browser tabs cannot universally detect an app installed elsewhere. The customer listener does not capture events on admin/rider pages.

Android customers can use Chrome's installation option. iPhone/iPad customers use Safari → Share → Add to Home Screen and keep Open as Web App enabled if shown. Computer instructions cover Chrome and Edge. When the prompt is unavailable, the page shows installation steps without a nonworking Install button. No notification permission is requested here; customer alerts remain optional on tracking pages. Internet is required for ordering and tracking. The existing installed customer app still starts at `/orders`.

Deployment: push the frontend to GitHub and wait for Vercel. `/get-app` is included in `vercel.json` so direct links work. **No SQL, database functions, RLS policies, indexes, Edge Function deployments or secrets are needed.**

Checks: `node scripts/test-install-app-browser.mjs` runs against the local dev server on port 5182 using the existing Playwright/Chrome tools. External requests are mocked or blocked and installation events are simulated. It covers navigation, all prompt outcomes, standalone mode, mobile layout, no notification prompts and rider isolation. Run `npm run build`. After deployment, verify real installation on Android Chrome and iPhone Safari over HTTPS; browser installation eligibility cannot be proven by simulated events.

References: [Chrome install-prompt guidance](https://web.dev/articles/customize-install), [Apple Home Screen app instructions](https://support.apple.com/guide/iphone/iphea86e5236/ios).
