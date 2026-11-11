// No network calls or live credentials: exercise the actual Edge handler with
// controlled fetch responses, including retries of orders that already exist.
import assert from 'node:assert/strict';

const id = '11111111-1111-4111-8111-111111111111';
let handler: (request: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (callback: typeof handler) => { handler = callback; } });
for (const [name, value] of Object.entries({
  SUPABASE_URL: 'https://kfc-test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  ALLOWED_ORIGIN: 'https://customer.test', TELEGRAM_ENABLED: 'false',
  RESTAURANT_LAT: '26.0055083', RESTAURANT_LNG: '63.0600925',
  OPENROUTESERVICE_API_KEY: 'test-only', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
})) Deno.env.set(name, value);

let minimum = 500, subtotal = 499, replay = false, settingsFailure = false, insertMinimumRace = false;
let routingCalls = 0, settingsCalls = 0, insertCalls = 0, releases = 0;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'api.heigit.org') {
    routingCalls++;
    return json({ routes: [{ summary: { distance: 3900 } }] });
  }
  assert.equal(url.hostname, 'kfc-test.invalid', 'No live service may be called');
  const path = url.pathname;
  if (path.endsWith('/rpc/begin_order_request')) return json(replay
    ? { status: 'replay', orderId: id, subtotal: 100, createdAt: '2026-11-01T12:00:00Z' }
    : { status: 'accepted', leaseId: id });
  if (path.endsWith('/rpc/release_order_request')) { releases++; return json(null); }
  if (path.endsWith('/rpc/price_menu_cart')) return json([{ productId: id, name: 'Test food', unitPrice: subtotal, quantity: 1, lineTotal: subtotal }]);
  if (path.endsWith('/restaurant_settings')) {
    settingsCalls++;
    return settingsFailure ? json({ code: '42P01', message: 'Test unavailable' }, 400) : json({ minimum_order_amount: minimum });
  }
  if (path.endsWith('/rpc/delivery_charge_for_distance')) return json(150);
  if (path.endsWith('/rpc/claim_push_jobs')) return json([]);
  if (path.endsWith('/orders') && init?.method === 'POST') {
    insertCalls++;
    const saved = JSON.parse(String(init.body));
    assert.equal(saved.subtotal, subtotal, 'Order uses server menu prices');
    if (insertMinimumRace) return json({ code: 'PFC01', message: 'Minimum food order is Rs. 700 (excluding delivery). Please add more items.' }, 400);
    return json({ id, created_at: '2026-11-10T12:00:00Z' });
  }
  if (path.endsWith('/orders') && init?.method === 'PATCH') return json(null);
  throw new Error('Unexpected mocked endpoint: ' + path);
};
await import('../supabase/functions/create-order/index.ts');

Deno.test('create-order minimum, database race, replay and empty CORS response', async () => {
  const send = () => handler(new Request('https://kfc-test.invalid/functions/v1/create-order', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://customer.test' },
    body: JSON.stringify({ requestId: id, customer: { name: 'Test customer', phone: '03000000000', address: 'Test address' },
      items: [{ itemId: id, sizeId: null, quantity: 1 }], deliveryLocation: { lat: 26.01, lng: 63.07 },
      deliveryCharge: 150, minimumOrderAmount: 0, subtotal: 999999 }),
  }));
  const options = await handler(new Request('https://kfc-test.invalid/functions/v1/create-order', { method: 'OPTIONS', headers: { Origin: 'https://customer.test' } }));
  assert.equal(options.status, 204);
  assert.equal(await options.text(), '');

  let response = await send();
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'MINIMUM_ORDER_NOT_MET');
  assert.equal(routingCalls, 0);
  assert.equal(insertCalls, 0);
  assert.equal(releases, 1);

  subtotal = 500;
  response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).orderId, id);
  assert.equal(insertCalls, 1);

  insertMinimumRace = true;
  response = await send();
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'MINIMUM_ORDER_NOT_MET');
  insertMinimumRace = false;

  settingsFailure = true;
  response = await send();
  assert.equal(response.status, 503);
  settingsFailure = false;

  const beforeReplay = { settingsCalls, insertCalls, releases };
  minimum = 5000;
  replay = true;
  response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).replayed, true);
  assert.deepEqual({ settingsCalls, insertCalls, releases }, beforeReplay);

  replay = false;
  minimum = 0;
  subtotal = 1;
  response = await send();
  assert.equal(response.status, 200);
});
