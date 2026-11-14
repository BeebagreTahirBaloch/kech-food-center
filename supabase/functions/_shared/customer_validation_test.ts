import assert from 'node:assert/strict';
import { validateCustomer } from './orders.ts';

Deno.test('checkout requires an eleven-digit local mobile number starting with 03', () => {
  const customer = { name: 'Test customer', address: 'Test address' };
  for (const phone of ['03001234567', '03111234567', '03999999999']) {
    assert.equal(validateCustomer({ ...customer, phone }).phone, phone);
  }
  for (const phone of ['', '0300123456', '030012345678', '02001234567', '+923001234567',
    '0300 1234567', '0300-1234567', '03abcdefghi', 3001234567, null]) {
    assert.throws(() => validateCustomer({ ...customer, phone }), /11-digit phone number starting with 03/);
  }
});
