// Real Edge handlers with all outbound fetches intercepted; no live orders or API calls.
import assert from 'node:assert/strict';
import { deliveryClientHash } from '../supabase/functions/_shared/deliverySecurity.ts';
import { straightLineDistance } from '../supabase/functions/_shared/delivery.js';

const id = '11111111-1111-4111-8111-111111111111';
type Handler = (request: Request) => Promise<Response>;
let registered: Handler;
Object.defineProperty(Deno, 'serve', { value: (callback: Handler) => { registered = callback; } });
for (const [key, value] of Object.entries({
  SUPABASE_URL: 'https://kfc-test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-test-only',
  ALLOWED_ORIGIN: 'https://customer.test', TELEGRAM_ENABLED: 'false',
  RESTAURANT_LAT: '26', RESTAURANT_LNG: '63', OPENROUTESERVICE_API_KEY: 'fake-test-only',
})) Deno.env.set(key, value);
let limited = false, limiterFailure = false, radius: number | null = 15, routeBudget = true;
let radiusFailure = false, budgetFailure = false, replay = false, orderExists = false, cancelled = false, arrived = false;
let routes = 0, redirects = 0, reservations = 0, inserts = 0, limitChecks = 0;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input)), path = url.pathname;
  if (url.hostname === 'api.heigit.org') { routes++; return json({ routes: [{ summary: { distance: 4900 } }] }); }
  if (url.hostname === 'maps.app.goo.gl') { redirects++; return new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps?q=24.86,67.01' } }); }
  if (url.hostname === 'www.google.com') { redirects++; return new Response(null, { status: 200 }); }
  assert.equal(url.hostname, 'kfc-test.invalid', 'Unmocked network request blocked');
  if (path.endsWith('/rpc/check_delivery_request')) {
    limitChecks++;
    assert.match(JSON.parse(String(init?.body)).p_client_hash, /^[a-f0-9]{64}$/);
    return limiterFailure ? json({ message: 'private database detail' }, 500) : json({ allowed: !limited, retryAfter: 42 });
  }
  if (path.endsWith('/restaurant_settings')) return radiusFailure ? json({ message: 'private database detail' }, 500) : json({ minimum_order_amount: 0, delivery_radius_km: radius });
  if (path.endsWith('/rpc/reserve_delivery_route')) { reservations++; return budgetFailure ? json({ message: 'private database detail' }, 500) : json(routeBudget); }
  if (path.endsWith('/rpc/begin_order_request')) return json(replay ? { status: 'replay', orderId: id, subtotal: 500, createdAt: '2026-11-01T12:00:00Z' } : { status: 'accepted', leaseId: id });
  if (path.endsWith('/rpc/release_order_request')) return json(null);
  if (path.endsWith('/rpc/price_menu_cart')) return json([{ productId: id, name: 'Test food', unitPrice: 500, quantity: 1, lineTotal: 500 }]);
  if (path.endsWith('/rpc/delivery_charge_for_distance')) return json(100);
  if (path.endsWith('/rpc/claim_push_jobs')) return json([]);
  if (path.endsWith('/rpc/customer_here')) return json(arrived ? 'updated' : 'Order already changed');
  if (path.endsWith('/orders') && init?.method === 'POST') {
    inserts++;
    const body = JSON.parse(String(init.body));
    assert.equal(body.subtotal, 500); assert.equal(body.delivery_charge, 100); assert.equal(body.total, 600);
    return json({ id, created_at: '2026-11-11T12:00:00Z' });
  }
  if (path.endsWith('/orders') && init?.method === 'PATCH') {
    if (JSON.parse(String(init.body)).status === 'cancelled') {
      assert.equal(url.searchParams.get('status'), 'eq.pending', 'Cancellation is conditional, not a read-then-update race');
      return json(cancelled ? { id, telegram_chat_id: null, telegram_message_id: null } : null);
    }
    return json(null);
  }
  if (path.endsWith('/orders')) { assert.equal(url.searchParams.get('select'), 'id'); return json(orderExists ? { id } : null); }
  throw Error('Unexpected local endpoint: ' + path);
};
await import('../supabase/functions/estimate-delivery/index.ts'); const estimate = registered!;
await import('../supabase/functions/create-order/index.ts'); const create = registered!;
await import('../supabase/functions/cancel-order/index.ts'); const cancel = registered!;
await import('../supabase/functions/customer-here/index.ts'); const here = registered!;
const request = (body: unknown, origin: string | null = 'https://customer.test') => new Request('https://kfc-test.invalid/functions/v1/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});
const near = { lat: 26.01, lng: 63.01 }, far = { lat: 24.86, lng: 67.01 };
const cart = (deliveryLocation: unknown) => ({ requestId: id, customer: { name: 'Test customer', phone: '03000000000', address: 'Test address' },
  items: [{ itemId: id, sizeId: null, quantity: 1 }], deliveryLocation, deliveryCharge: 100, subtotal: 999999, deliveryRadiusKm: 99999 });

Deno.test('delivery checks: limits before redirects, shared budget, admin radius, direct checkout, missing orders and privacy', async () => {
  for (const handler of [estimate, create, cancel, here]) {
    const options = await handler(new Request('https://kfc-test.invalid/test', { method: 'OPTIONS', headers: { Origin: 'https://customer.test' } }));
    assert.equal(options.status, 204); assert.equal(await options.text(), '');
    assert.equal((await handler(request({}, 'https://untrusted.test'))).status, 403);
  }
  assert.equal(limitChecks, 0, 'Preflight and rejected origins perform no database work');
  let result = await estimate(request({ deliveryLocation: near }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { distanceKm: 4.9, distanceMethod: 'openrouteservice', deliveryCharge: 100 });
  const beforeFar = { routes, reservations, inserts };
  result = await estimate(request({ deliveryLocation: far, deliveryRadiusKm: 99999 }));
  assert.equal(result.status, 422); assert.equal((await result.json()).code, 'OUTSIDE_SERVICE_AREA');
  result = await create(request(cart(far)));
  assert.equal(result.status, 422); assert.equal((await result.json()).code, 'OUTSIDE_SERVICE_AREA');
  assert.deepEqual({ routes, reservations, inserts }, beforeFar, 'Outside locations never use ORS or create orders');
  result = await estimate(request({ deliveryLocation: { googleMapsUrl: 'https://maps.app.goo.gl/test-only' } }));
  assert.equal(result.status, 422); assert.equal(routes, beforeFar.routes); assert.equal(redirects, 2);
  limited = true;
  for (const origin of ['https://customer.test', null]) {
    result = await estimate(request({ deliveryLocation: { googleMapsUrl: 'https://maps.app.goo.gl/test-only' } }, origin));
    assert.equal(result.status, 429); assert.equal(result.headers.get('Retry-After'), '42');
    assert.equal((await result.json()).retryAfter, 42); assert.equal(redirects, 2);
  }
  limited = false; limiterFailure = true;
  result = await estimate(request({ deliveryLocation: near }));
  assert.equal(result.status, 503); assert.ok(!(await result.text()).includes('private database'));
  limiterFailure = false; radius = null;
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 503);
  radius = 0.5;
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 422);
  // An owner expansion applies to the next check; radius uses unrounded straight-line distance.
  radius = 15;
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 200);
  const boundary = straightLineDistance({ lat: 26, lng: 63 }, near);
  radius = boundary;
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 200);
  radius = boundary - 0.00001;
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 422);
  radius = 15; routeBudget = false;
  const beforeFallback = routes;
  result = await estimate(request({ deliveryLocation: near }));
  assert.equal(result.status, 200); assert.equal((await result.json()).distanceMethod, 'haversine');
  assert.equal((await create(request(cart(near)))).status, 200);
  assert.equal(routes, beforeFallback, 'Both endpoints respect shared provider budget');
  Deno.env.delete('OPENROUTESERVICE_API_KEY');
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 503, 'Exhausted budget must not mask missing server configuration');
  Deno.env.set('OPENROUTESERVICE_API_KEY', 'fake-test-only');
  budgetFailure = true;
  assert.equal((await estimate(request({ deliveryLocation: near }))).status, 503);
  budgetFailure = false; radiusFailure = true; replay = true;
  result = await create(request(cart(far)));
  assert.equal(result.status, 200); assert.equal((await result.json()).replayed, true, 'Old order retries bypass new radius/limits');
  radiusFailure = false;
  for (const handler of [cancel, here]) {
    result = await handler(request({ orderId: id }));
    assert.equal(result.status, 404); assert.equal((await result.json()).error, 'Order not found.');
    orderExists = true;
    result = await handler(request({ orderId: id })); assert.equal(result.status, 409);
    assert.ok(!(await result.text()).includes('Test customer'));
    orderExists = false;
    assert.equal((await handler(request({ orderId: 'invalid' }))).status, 400);
  }
  cancelled = true; arrived = true;
  assert.equal((await cancel(request({ orderId: id }))).status, 200);
  assert.equal((await here(request({ orderId: id }))).status, 200);
  const ipRequest = (ip: string) => new Request('https://test.invalid', { headers: { 'x-forwarded-for': ip } });
  assert.equal(await deliveryClientHash(ipRequest('2001:db8:0:0:0:0:0:1')), await deliveryClientHash(ipRequest('2001:db8::1')));
  assert.notEqual(await deliveryClientHash(ipRequest('192.0.2.1')), await deliveryClientHash(ipRequest('192.0.2.2')));
  assert.match(await deliveryClientHash(ipRequest('not-an-ip')), /^[a-f0-9]{64}$/);
});
