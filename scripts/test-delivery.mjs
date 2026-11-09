import assert from 'node:assert/strict';
import { suggestedCharge, deliveryDistance, roadDistance } from '../supabase/functions/_shared/delivery.js';

for (const [km, price] of [[0, 100], [5, 100], [5.01, 150], [8, 150], [8.01, 300], [100, 300]]) {
  assert.equal(suggestedCharge(km), price);
}
assert.throws(() => suggestedCharge(NaN));
assert.throws(() => suggestedCharge(-1));

// Every request is intercepted; no API key or external service is needed.
const originalFetch = globalThis.fetch;
const options = { apiKey: 'fake-ors-test-key' };
const origin = { lat: 26, lng: 63 };
const destination = { lat: 26.01, lng: 63.02 };
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
let requests = [];
let reply = () => response({ routes: [{ summary: { distance: 4912 } }] });
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  return reply();
};

async function rejectsWithoutLeaking(run) {
  await assert.rejects(run, error => {
    assert.ok(error instanceof Error && error.message.length > 0);
    assert.ok(!error.message.includes(options.apiKey));
    assert.ok(!error.message.includes('private-provider-debug'));
    return true;
  });
}

try {
  assert.deepEqual(await deliveryDistance(origin, destination, options), {
    distanceKm: 4.9, distanceMethod: 'openrouteservice',
  });
  assert.equal(requests.length, 1);
  const { url, init } = requests[0];
  assert.equal(url, 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/json');
  assert.equal(init.method, 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('Authorization'), options.apiKey);
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  const body = JSON.parse(init.body);
  assert.deepEqual(body.coordinates, [[63, 26], [63.02, 26.01]]);
  assert.equal(body.units, 'm');
  assert.equal(body.preference, 'fastest');
  assert.equal(body.instructions, false);
  assert.equal(body.geometry, false);
  assert.ok(!init.body.includes(options.apiKey));
  assert.equal(await roadDistance(origin, destination, options), 4.9);

  // Zero is a valid distance; null, empty strings and numeric strings are not.
  reply = () => response({ routes: [{ summary: { distance: 0 } }] });
  assert.deepEqual(await deliveryDistance(origin, origin, options), {
    distanceKm: 0, distanceMethod: 'openrouteservice',
  });

  const beforeInvalid = requests.length;
  await rejectsWithoutLeaking(() => deliveryDistance(origin, destination));
  await rejectsWithoutLeaking(() => deliveryDistance(origin, destination, { apiKey: '   ' }));
  for (const point of [{ lat: NaN, lng: 63 }, { lat: 91, lng: 63 }, { lat: 26, lng: 181 }, { lat: 26, lng: Infinity }, { lat: '26', lng: 63 }]) {
    await rejectsWithoutLeaking(() => deliveryDistance(point, destination, options));
    await rejectsWithoutLeaking(() => deliveryDistance(origin, point, options));
  }
  assert.equal(requests.length, beforeInvalid, 'Invalid coordinates/configuration must not consume requests');

  for (const status of [401, 403, 400, 404, 422]) {
    reply = () => response({ error: { message: `private-provider-debug ${options.apiKey}` } }, status);
    const count = requests.length;
    await rejectsWithoutLeaking(() => deliveryDistance(origin, destination, options));
    assert.equal(requests.length, count + 1, 'Auth and no-route failures must not retry');
  }

  const fallbackOrigin = { lat: 0, lng: 0 };
  const fallbackDestination = { lat: 1, lng: 0 };
  const failures = [
    () => response({}, 429),
    () => response({}, 500),
    () => response({}, 503),
    () => { throw new TypeError('private-provider-debug'); },
    () => { throw new DOMException('private-provider-debug', 'TimeoutError'); },
    () => new Response('not-json', { status: 200 }),
    () => response({}),
    () => response({ routes: [] }),
    () => response({ routes: [{ summary: {} }] }),
    ...[null, '', '4912', -100].map(distance => () => response({ routes: [{ summary: { distance } }] })),
    () => ({ ok: true, status: 200, json: async () => ({ routes: [{ summary: { distance: Infinity } }] }) }),
  ];
  for (const fail of failures) {
    reply = fail;
    const count = requests.length;
    const result = await deliveryDistance(fallbackOrigin, fallbackDestination, options);
    assert.deepEqual(result, { distanceKm: 144.6, distanceMethod: 'haversine' });
    assert.equal(requests.length, count + 1, 'Unavailable routing must not trigger retry storms');
  }
  assert.equal(await roadDistance(origin, origin, options), 0);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Delivery tiers, openrouteservice requests, private errors and explicit Haversine fallback passed.');
