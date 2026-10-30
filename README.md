# Kech Food Center

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

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor, or link the Supabase CLI and run `supabase db push`.
2. Keep the Supabase project URL and **anon** key in the Vite environment. Never put the service role key, Telegram bot token, rider chat ID, or webhook secret in a `VITE_` variable.
3. Set function secrets. `ALLOWED_ORIGIN` is an exact, comma-separated allowlist; include your Vercel origin and the local Vite origin while developing:

   ```sh
   supabase secrets set \
     TELEGRAM_BOT_TOKEN="<BOT_TOKEN>" \
     TELEGRAM_RIDER_CHAT_ID="<RIDER_CHAT_ID>" \
     TELEGRAM_WEBHOOK_SECRET="<LONG_RANDOM_SECRET>" \
     RESTAURANT_LAT="<RESTAURANT_LATITUDE>" \
     RESTAURANT_LNG="<RESTAURANT_LONGITUDE>" \
     SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>" \
     ALLOWED_ORIGIN="https://<YOUR_VERCEL_DOMAIN>,http://localhost:5173"
   ```

   Replace the placeholders. Use the restaurant's actual coordinates for `RESTAURANT_LAT/LNG` and the same values for `VITE_RESTAURANT_LAT/LNG` in Vercel. Do not commit real secrets.
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
2. Open the new bot as the rider and press **Start**. The rider needs to start the bot before it can send them order notifications.
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
- `create-order` accepts a pin or Google Maps URL, including short links, recomputes item prices from the same `src/data/menu.js` data, and stores orders with `pending` status and no delivery charge.
- The rider receives an order message, a real Telegram location pin, distance, suggested charge, and a Google Maps Navigate button.
- Accepting offers Rs. 100, 150, 200, 300, 400, or 500 charge buttons. The next keyboard offers 30 minutes, 1 hour, or 2 hours.
- The customer sees the quote and can confirm or cancel. Status updates are sent to the single order's Realtime topic. Public tracking payloads omit customer phone, name, and address.
- The `get-order` Edge Function returns only the order named by its UUID. Table RLS grants read access only to safe tracking columns and filters direct anonymous reads by `x-order-id`; anonymous inserts, updates, deletes, and order listing are revoked.
- If Telegram notification fails after the order is saved, `telegram_error` is recorded and the customer still receives a tracking link. Check the Supabase order row and function logs to follow up manually.

## Assumptions and manual setup

- Delivery charges are PKR and the rider chooses from Rs. 100, 150, 200, 300, 400, or 500. Suggested distance tiers are 0–2 km Rs. 100, over 2–5 km Rs. 200, over 5–8 km Rs. 300, and over 8 km Rs. 400.
- The restaurant coordinates, Vercel domain, Supabase project, Telegram bot, rider chat ID, and production secrets still need to be supplied by the owner in the locations above.
- OpenStreetMap tiles and the public OSRM demo service are used without an API key. For production traffic, use a hosted routing service if the public OSRM demo service's usage policy or availability becomes unsuitable.
- A failed Telegram notification does not discard the saved order; staff must check the Supabase row/logs and contact that customer.
