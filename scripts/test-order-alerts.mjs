import assert from 'node:assert/strict';
import { createStatusObserver, orderAlert, terminalStatuses } from '../src/lib/orderAlerts.js';

const observe = createStatusObserver();
assert.equal(observe(undefined), false);
assert.equal(observe('pending'), false, 'Initial fetch is a baseline');
assert.equal(observe('pending'), false);
for (const status of ['awaiting_charge', 'quoted', 'confirmed', 'out_for_delivery', 'delivered']) {
  assert.equal(observe(status), true, `Announce ${status}`);
  assert.equal(observe(status), false, 'Duplicate broadcasts/polls are silent');
}
assert.equal(observe('quoted'), false, 'Previously seen states stay silent');
assert.equal(createStatusObserver()('delivered'), false, 'Opening an old order is silent');
const free = orderAlert({ status: 'quoted', deliveryCharge: 0, total: 500, etaMinutes: 30 });
assert.match(free.body, /Delivery charge: Rs. 0/);
assert.match(free.body, /Total: Rs. 500/);
assert.match(free.body, /30 minutes/);
assert.match(orderAlert({ status: 'awaiting_charge' }).body, /being set/);
assert.equal(orderAlert({ status: 'declined' }).title, 'Your order was cancelled');
assert.equal(orderAlert({ status: 'cancelled' }).title, 'Your order was cancelled');
assert.deepEqual([...terminalStatuses], ['delivered', 'cancelled', 'declined']);
assert.equal(terminalStatuses.has('quoted'), false);
const privateOrder = { status: 'quoted', customer_name: 'PRIVATE', phone: 'PRIVATE', address: 'PRIVATE' };
assert.equal(JSON.stringify(orderAlert(privateOrder)).includes('PRIVATE'), false);
console.log('Order alert transition, deduplication, free-delivery and privacy checks passed.');
