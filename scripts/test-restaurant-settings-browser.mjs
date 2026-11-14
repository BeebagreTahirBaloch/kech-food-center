import { chromium } from '../.test-tools/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const env = await readFile('.env', 'utf8');
const host = new URL(env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname;
const base = 'http://127.0.0.1:5182';
const ownerId = '11111111-1111-4111-8111-111111111111';
const foodId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const session = {
  access_token: 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: ownerId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url') + '.test',
  refresh_token: 'test-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
  token_type: 'bearer', user: { id: ownerId, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
};
let settings = { minimum_order_amount: 600, restaurant_phone: '03352053652', delivery_radius_km: 15 };
let settingsFail = false, radiusFail = false, radiusWrites = 0, adminAllowed = true, outsideArea = false;
let writes = 0, orderCalls = 0, status = 'pending', rider = null;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
await context.routeWebSocket('**/*', ws => ws.close());
await context.addInitScript(({ host, session, foodId }) => {
  localStorage.setItem('kfc-' + host + '-admin', JSON.stringify(session));
  localStorage.setItem('cart', JSON.stringify([{ itemId: foodId, sizeId: null, quantity: 1 }]));
  sessionStorage.setItem('kech-ad-seen', 'true');
}, { host, session, foodId });
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  if (url.hostname === '127.0.0.1') return route.continue();
  if (url.hostname !== host) return route.abort();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path.endsWith('/restaurant_settings')) {
    if (request.method() === 'PATCH') {
      assert.equal(request.headers().authorization, 'Bearer ' + session.access_token);
      const changes = request.postDataJSON();
      if ('delivery_radius_km' in changes) radiusWrites++; else writes++;
      settings = { ...settings, ...changes };
      return reply(settings);
    }
    return settingsFail || (radiusFail && url.searchParams.get('select') === 'delivery_radius_km') ? reply({ message: 'Test settings unavailable' }, 500) : reply(settings);
  }
  if (path.endsWith('/admins')) return reply(adminAllowed ? [{ user_id: ownerId }] : []);
  if (path.endsWith('/logout')) return reply(null);
  if (path.endsWith('/user')) return reply(session.user);
  if (path.endsWith('/categories')) return reply([{ id: 'burgers', name: 'Burgers', sort_order: 0 }]);
  if (path.endsWith('/menu_items')) return reply([{ id: foodId, category_id: 'burgers', name: 'Test Burger', base_price: 500, is_available: true, is_deleted: false, item_sizes: [] }]);
  if (path.endsWith('/ordering_hours')) return reply({ enabled: false, paused: false, opens_at: '12:00', closes_at: '23:00' });
  if (path.endsWith('/ordering_status')) return reply({ enabled: false, paused: false, isOpen: true });
  if (path.endsWith('/delivery_rates')) return reply({ tiers: [{ maxKm: null, charge: 600 }] });
  if (path.endsWith('/delivery_settings')) return reply({ max_active_orders: 3, nearby_order_km: 1, pending_alert_minutes: 10, stalled_alert_minutes: 20 });
  if (path.endsWith('/admin_waiting_orders')) return reply({ count: 0, orders: [], threshold: 10 });
  if (path.endsWith('/rider_availability')) return reply({ allBusy: false, noneOnline: false });
  if (path.endsWith('/estimate-delivery')) return outsideArea
    ? reply({ error: 'This location is outside our 20 km delivery area. Please choose a closer location.', code: 'OUTSIDE_SERVICE_AREA' }, 422)
    : reply({ deliveryCharge: 600, distanceKm: 3.9, distanceMethod: 'openrouteservice' });
  if (path.endsWith('/create-order')) {
    orderCalls++;
    const body = request.postDataJSON();
    assert.equal(body.deliveryCharge, 600);
    if (body.reviewedSubtotal < settings.minimum_order_amount) return reply({ code: 'MINIMUM_ORDER_NOT_MET', error: 'Minimum food order is Rs. 1,500 (excluding delivery). Please add more items.' }, 422);
    return reply({ orderId, subtotal: body.reviewedSubtotal, createdAt: new Date().toISOString() });
  }
  if (path.endsWith('/get-order')) return reply({ order: { id: orderId, status, rider,
    createdAt: new Date().toISOString(), confirmedAt: new Date(Date.now() - 7200000).toISOString(), etaMinutes: 30,
    subtotal: 1500, deliveryCharge: 600, total: 2100, items: [{ name: 'Test Burger', quantity: 3, unitPrice: 500 }],
  } });
  return reply(null);
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page fits mobile width');
const manifest = async role => {
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  assert.equal(await page.locator('#app-manifest').getAttribute('href'), `/${role}.webmanifest`);
};
const callsUse = async (phone, allowedRider = null) => {
  const hrefs = await page.locator('a[href^="tel:"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
  assert.ok(hrefs.length >= 4);
  assert.ok(hrefs.every(href => href === 'tel:' + phone || href === 'tel:' + allowedRider));
};
const estimate = async () => {
  await page.getByRole('radio', { name: 'Paste a Google Maps link' }).check();
  await page.getByRole('textbox', { name: 'Google Maps link' }).fill('https://maps.google.com/?q=26.01,63.07');
  await page.getByText('Road distance: 3.9 km', { exact: true }).waitFor();
};
try {
  await page.goto(base + '/admin/settings');
  const panel = page.getByRole('region', { name: 'Minimum order & restaurant contact' });
  await panel.getByRole('button', { name: 'Save restaurant settings' }).waitFor();
  await panel.getByLabel(/^Minimum order amount/).fill('1000');
  await panel.getByLabel(/^Restaurant phone number/).fill('+92 (300) 123-4567');
  await panel.getByRole('button', { name: 'Save restaurant settings' }).click();
  await panel.getByText('Restaurant settings saved. Existing orders keep their totals.').waitFor();
  assert.deepEqual(settings, { minimum_order_amount: 1000, restaurant_phone: '+923001234567', delivery_radius_km: 15 });
  await manifest('owner');
  await fits();
  await mkdir('.test-results', { recursive: true });
  await panel.screenshot({ path: '.test-results/restaurant-settings-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.screenshot({ path: '.test-results/restaurant-settings-desktop.png' });
  await panel.getByLabel(/^Restaurant phone number/).fill('not-a-phone');
  await panel.getByRole('button', { name: 'Save restaurant settings' }).click();
  await panel.getByRole('alert').waitFor();
  assert.equal(writes, 1, 'Invalid phone is not saved');
  const area = page.getByRole('region', { name: 'Delivery service area' });
  const radius = area.getByLabel('Maximum delivery radius (km)');
  await radius.fill('');
  assert.equal(await radius.isVisible(), true, 'Clearing the field must not unmount the form');
  await area.getByRole('button', { name: 'Save delivery area' }).click();
  assert.equal(radiusWrites, 0);
  await radius.fill('20');
  await area.getByRole('button', { name: 'Save delivery area' }).click();
  await area.getByText('Delivery area saved: within 20 km of the restaurant. Existing orders are unchanged.').waitFor();
  assert.equal(settings.delivery_radius_km, 20);
  await page.setViewportSize({ width: 320, height: 844 });
  await fits();
  await area.screenshot({ path: '.test-results/delivery-area-mobile.png' });
  await page.reload();
  await radius.waitFor();
  assert.equal(await radius.inputValue(), '20');
  radiusFail = true;
  await page.reload();
  await area.getByRole('button', { name: 'Retry delivery area' }).waitFor();
  radiusFail = false;
  await area.getByRole('button', { name: 'Retry delivery area' }).click();
  await radius.waitFor();
  assert.equal(await radius.inputValue(), '20');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(base);
  await manifest('customer');
  await page.getByRole('link', { name: 'Call us: +923001234567', exact: true }).waitFor();
  await callsUse('+923001234567');
  await page.goto(base + '/cart');
  await page.getByText('Minimum food order: Rs. 1,000', { exact: true }).waitFor();
  assert.equal(await page.getByRole('progressbar', { name: 'Food subtotal toward minimum order' }).getAttribute('aria-valuenow'), '500');
  await page.locator('.checkout-minimum-notice').screenshot({ path: '.test-results/minimum-notice-below.png' });
  await page.locator('.checkout-items-summary').screenshot({ path: '.test-results/items-subtotal-mobile.png' });
  await estimate();
  outsideArea = true;
  await page.getByRole('button', { name: 'Refresh delivery charge' }).click();
  await page.getByText('This location is outside our 20 km delivery area. Please choose a closer location.').waitFor();
  assert.equal(orderCalls, 0);
  outsideArea = false;
  await page.getByRole('button', { name: 'Refresh delivery charge' }).click();
  await page.getByText('Road distance: 3.9 km', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'ADD Rs. 500 MORE' }).isDisabled(), true);
  assert.equal(orderCalls, 0);
  await callsUse('+923001234567');
  await fits();
  await page.locator('.order-details-box').screenshot({ path: '.test-results/minimum-cart-mobile.png' });
  await page.getByRole('button', { name: 'Increase Test Burger', exact: true }).click();
  await page.getByText(/Your cart meets the minimum order/).waitFor();
  assert.equal(await page.getByRole('progressbar', { name: 'Food subtotal toward minimum order' }).count(), 0);
  await page.locator('.checkout-minimum-notice').screenshot({ path: '.test-results/minimum-notice-met.png' });
  assert.equal(await page.getByRole('button', { name: 'SEND ORDER · Rs. 1,600' }).isEnabled(), true);
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Test customer');
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('03000000000');
  await page.getByRole('textbox', { name: 'Full address', exact: true }).fill('Test address');

  // The owner raises the minimum after this checkout loaded. Keep the cart and
  // refresh the limit when the server refuses, then allow a corrected checkout.
  settings.minimum_order_amount = 1500;
  await page.getByRole('button', { name: 'SEND ORDER · Rs. 1,600' }).click();
  await page.getByText('Minimum food order: Rs. 1,500', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'ADD Rs. 500 MORE' }).isDisabled(), true);
  assert.equal(orderCalls, 1);
  assert.equal(await page.locator('.cart-item-qty').innerText(), '2');
  await page.getByRole('button', { name: 'Increase Test Burger', exact: true }).click();
  await page.getByRole('button', { name: 'SEND ORDER · Rs. 2,100' }).click();
  await page.waitForURL(base + '/track/' + orderId);
  await manifest('customer');
  await page.getByRole('link', { name: 'Call restaurant', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cart'))), []);
  await callsUse('+923001234567');
  status = 'confirmed';
  await page.goto(base + '/orders');
  await page.getByRole('link', { name: 'Call restaurant', exact: true }).waitFor();
  await callsUse('+923001234567');
  rider = { name: 'Test rider', phone: '03111111111' };
  await page.goto(base + '/track/' + orderId);
  await page.getByRole('link', { name: 'Call rider', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Call rider', exact: true }).getAttribute('href'), 'tel:03111111111');
  await callsUse('+923001234567', '03111111111');

  await page.goto(base + '/admin/settings');
  await panel.getByLabel(/^Minimum order amount/).fill('0');
  await panel.getByRole('button', { name: 'Save restaurant settings' }).click();
  await panel.getByText('Restaurant settings saved. Existing orders keep their totals.').waitFor();
  await page.evaluate(foodId => localStorage.setItem('cart', JSON.stringify([{ itemId: foodId, sizeId: null, quantity: 1 }])), foodId);
  await page.goto(base + '/cart');
  await estimate();
  assert.equal(await page.locator('.checkout-minimum-notice').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'SEND ORDER · Rs. 1,100' }).isEnabled(), true);
  settingsFail = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('button', { name: 'Retry restaurant settings' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'SEND ORDER · Rs. 1,100' }).isDisabled(), true);
  settingsFail = false;
  await page.getByRole('button', { name: 'Retry restaurant settings' }).click();
  await page.getByRole('button', { name: 'Retry restaurant settings' }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'SEND ORDER · Rs. 1,100' }).isEnabled(), true);
  await page.setViewportSize({ width: 320, height: 844 });
  await fits();
  await page.goto(base + '/rider');
  await page.getByRole('heading', { name: 'KFC Turbat Rider' }).waitFor();
  await manifest('rider');
  adminAllowed = false;
  await page.goto(base + '/admin/settings');
  await page.getByText('Not authorized', { exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Delivery service area' }).count(), 0);
  await manifest('owner');
  await page.getByRole('link', { name: 'Back to menu' }).click();
  await manifest('customer');
  assert.deepEqual(errors, []);
  console.log('PASS: admin radius editing/recovery and access, mobile layout, one manifest per role, outside-area checkout error, restaurant phone, minimum amount, cart retention and successful checkout');
} finally { await browser.close(); }
