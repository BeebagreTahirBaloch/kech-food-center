// Browser APIs and every remote request are mocked: no live notifications or orders.
import { chromium } from '../.test-tools/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env = await readFile('.env', 'utf8');
const host = new URL(env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname;
const base = 'http://127.0.0.1:5182';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const user = { id: ids[0], email: 'rider@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() / 1000 + 3600, role: 'authenticated' })).toString('base64url') + '.test', refresh_token: 'test', expires_at: Date.now() / 1000 + 3600, user };
let status = 'pending', pushSaves = 0, pending = [], failPush = false;
const registrations = new Set();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
await context.routeWebSocket('**/*', socket => socket.close());
await context.addInitScript(({ host, session }) => {
  sessionStorage.setItem('kech-ad-seen', 'true');
  localStorage.setItem('kfc-' + host + '-rider', JSON.stringify(session));
  window.alertTest = { resumes: 0, plays: 0, notices: 0, subscriptions: 0 };
  const count = name => sessionStorage.setItem(name, String(Number(sessionStorage.getItem(name) || 0) + 1));
  class FakeNotification {
    static get permission() { return sessionStorage.getItem('test-permission') || 'default'; }
    static async requestPermission() { count('test-prompts'); sessionStorage.setItem('test-permission', 'granted'); return 'granted'; }
    constructor() { window.alertTest.notices++; }
    close() {}
  }
  Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
  class FakeAudio {
    state = 'suspended'; currentTime = 0; destination = {};
    async resume() { this.state = 'running'; window.alertTest.resumes++; }
    createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { window.alertTest.plays++; }, stop() { queueMicrotask(() => this.onended?.()); } }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudio });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  const sub = { endpoint: 'https://fcm.googleapis.com/test-only', toJSON: () => ({ keys: { p256dh: 'test-key', auth: 'test-auth' } }), unsubscribe: async () => true };
  const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => { window.alertTest.subscriptions++; return sub; } } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => reg, getRegistration: async () => reg } });
}, { host, session });
await context.route('**/*', async route => {
  const url = new URL(route.request().url()), path = url.pathname;
  if (url.hostname === '127.0.0.1') return route.continue();
  if (url.hostname !== host) return route.abort();
  const reply = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
  if (path.endsWith('/get-order')) return reply({ order: { id: route.request().postDataJSON().orderId, status, subtotal: 500, total: 600, deliveryCharge: 100, etaMinutes: 30, createdAt: new Date().toISOString(), items: [] } });
  if (path.endsWith('/order-notifications')) {
    if (failPush) return reply({ error: 'Test connection failure' }, 503);
    const body = route.request().postDataJSON();
    assert.ok(body.ownerToken); assert.equal(body.endpoint, 'https://fcm.googleapis.com/test-only');
    if (body.action === 'save') { registrations.add(body.orderId); pushSaves++; }
    if (body.action === 'remove') registrations.delete(body.orderId);
    return reply({ enabled: registrations.has(body.orderId) });
  }
  if (path.endsWith('/restaurant_settings')) return reply({ minimum_order_amount: 0, restaurant_phone: '03000000000' });
  if (path.endsWith('/categories') || path.endsWith('/menu_items')) return reply([]);
  if (path.endsWith('/is_rider')) return reply(true);
  if (path.endsWith('/user')) return reply(user);
  if (path.endsWith('/rider_dashboard')) return reply({ profile: { name: 'Test rider', online: true }, pending, active: [], history: [], today: { delivered: 0, charges: 0, sales: 0 } });
  if (path.endsWith('/push_subscriptions')) return reply({ id: ids[0] });
  return reply(null);
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const openSettings = () => page.locator('.tracking-alert-settings > summary').click();
const promptCount = () => page.evaluate(() => Number(sessionStorage.getItem('test-prompts') || 0));
const saved = key => page.evaluate(key => localStorage.getItem(key), key);
const refresh = async () => {
  const response = page.waitForResponse(r => r.url().endsWith('/get-order'));
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); await response;
};
try {
  await page.goto(base + '/track/' + ids[0]); await openSettings();
  assert.equal(await promptCount(), 0, 'Never request permission on load');
  await page.getByRole('button', { name: 'Enable sound and alerts', exact: true }).click();
  await page.getByRole('button', { name: 'Turn off sound and page alerts', exact: true }).waitFor();
  assert.equal(await promptCount(), 1); assert.equal(await saved('kfc_customer_sound'), 'true');
  await page.getByRole('button', { name: 'Notify me about this order', exact: true }).click();
  await page.getByRole('button', { name: 'Turn off alerts', exact: true }).waitFor();
  assert.equal(await promptCount(), 1, 'Reuse granted notification permission'); assert.equal(pushSaves, 1);
  await page.reload(); await page.locator('.tracking-alert-settings').waitFor();
  assert.equal(await page.evaluate(() => alertTest.resumes), 0, 'No attempt to force autoplay on load');
  await openSettings();
  await page.getByRole('button', { name: 'Turn off alerts', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Turn off sound and page alerts', exact: true }).isVisible());
  assert.ok(await page.evaluate(() => alertTest.resumes > 0), 'Normal page tap unlocks remembered sound');
  assert.equal(pushSaves, 1); assert.equal(await promptCount(), 1);
  status = 'out_for_delivery'; await refresh();
  await page.locator('.order-alert-banner').getByText('Your order is on the way', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => alertTest.plays), 1);
  await refresh(); assert.equal(await page.evaluate(() => alertTest.plays), 1, 'No repeat sound for the same status');
  assert.equal(await page.evaluate(() => alertTest.notices), 0, 'Existing push avoids duplicate page system notifications');
  status = 'pending'; await page.goto(base + '/track/' + ids[1]); await openSettings();
  await page.getByRole('button', { name: 'Turn off alerts', exact: true }).waitFor();
  assert.equal(pushSaves, 2, 'New order reuses consent and subscription'); assert.equal(await promptCount(), 1);
  await page.getByRole('button', { name: 'Turn off alerts', exact: true }).click();
  await page.getByText(/Alerts off for this order/).waitFor();
  await page.getByRole('button', { name: 'Turn off sound and page alerts', exact: true }).click();
  assert.equal(await saved('kfc_customer_sound'), 'false'); assert.equal(await saved('kfc_customer_push'), 'false');
  await page.reload(); await openSettings();
  await page.getByRole('button', { name: 'Enable sound and alerts', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => alertTest.resumes), 0);
  status = 'out_for_delivery'; await refresh();
  await page.locator('.order-alert-banner').waitFor();
  assert.equal(await page.evaluate(() => alertTest.plays + alertTest.notices), 0, 'Off preferences prevent sound and page notifications');
  status = 'pending'; await page.goto(base + '/track/' + ids[2]); await openSettings();
  await page.getByRole('button', { name: 'Notify me about this order', exact: true }).waitFor();
  assert.equal(pushSaves, 2, 'Opt-out stops automatic future registrations');
  await page.evaluate(() => sessionStorage.setItem('test-permission', 'denied'));
  await page.reload(); await openSettings(); await page.getByText('Blocked in browser settings', { exact: true }).waitFor();
  assert.equal(await promptCount(), 1);
  // Rider sound is a separate device preference; existing rider push restores.
  await page.evaluate(() => sessionStorage.setItem('test-permission', 'granted'));
  await page.goto(base + '/rider'); await page.getByRole('heading', { name: 'Test rider', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await page.getByRole('button', { name: 'Turn off sound', exact: true }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Turn off sound', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => alertTest.resumes), 0);
  await page.getByRole('heading', { name: 'Test rider', exact: true }).click();
  pending = [{ id: ids[2], status: 'pending', items: [], subtotal: 500, distance_km: 2 }];
  await page.getByRole('button', { name: 'Refresh and check saved state' }).click();
  await page.getByRole('heading', { name: 'Order ' + ids[2].slice(0, 8) }).waitFor();
  assert.equal(await page.evaluate(() => alertTest.plays), 1);
  assert.equal(await saved('kfc_rider_sound'), 'true'); assert.equal(await promptCount(), 1);
  assert.equal(await page.getByRole('button', { name: 'Turn on order alerts', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: consent persistence, ordinary-tap audio unlock, no duplicate alerts, new-order push reuse, opt-out, denied permission and rider sound restore');
} finally { await browser.close(); }
