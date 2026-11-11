import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeRestaurantPhone, parseMinimumOrder } from '../src/lib/restaurantSettings.js';
import { activityChanges } from '../src/lib/adminActivity.js';

const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  create table public.admins(user_id uuid primary key);
  insert into public.admins values ('${admin}');
  create function public.is_admin() returns boolean language sql security definer set search_path='' as $$
    select exists(select 1 from public.admins where user_id=auth.uid()) $$;
  create table public.orders(id integer primary key, subtotal integer not null, delivery_charge integer, status text default 'pending');
  insert into public.orders(id,subtotal) values(1,100);
  grant select,insert,update on public.orders to service_role;
  create table public.admin_activity(actor_id uuid,action text,entity text,entity_id text,before_data jsonb,after_data jsonb);
  alter table public.admin_activity enable row level security;
  grant select on public.admin_activity to authenticated;
  create policy activity_admin_read on public.admin_activity for select to authenticated using (public.is_admin());
`);
const sql = await readFile('supabase/migrations/202611100001_restaurant_settings.sql', 'utf8');
const as = async (role, user = '') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [user]);
  await db.exec('set role ' + role);
};
try {
  await db.exec(sql);
  await db.exec(sql);
  await as('anon');
  assert.deepEqual((await db.query('select * from restaurant_settings')).rows, [{ id: true, minimum_order_amount: 0, restaurant_phone: '03352053652' }]);
  for (const statement of [
    'update restaurant_settings set minimum_order_amount=0',
    'delete from restaurant_settings',
    'insert into restaurant_settings(id) values(true)',
    'select * from orders',
    'select * from admin_activity',
    'select enforce_minimum_order_amount()',
    'select audit_restaurant_settings()',
  ]) await assert.rejects(db.exec(statement), { code: '42501' });

  await as('authenticated', customer);
  assert.equal((await db.query('select * from restaurant_settings')).rows.length, 1);
  assert.equal((await db.query('update restaurant_settings set minimum_order_amount=0 returning id')).rows.length, 0);
  assert.equal((await db.query('select * from admin_activity')).rows.length, 0);
  await as('authenticated', admin);
  await db.query('update restaurant_settings set minimum_order_amount=$1,restaurant_phone=$2', [500, '+923001234567']);
  await assert.rejects(db.exec('delete from restaurant_settings'), { code: '42501' });
  await assert.rejects(db.exec('update restaurant_settings set id=false'), { code: '42501' });
  for (const minimum of [-1, 2000001, null]) await assert.rejects(db.query('update restaurant_settings set minimum_order_amount=$1', [minimum]));
  for (const phone of ['', '123', '1234567890123456', 'tel:03001234567', '1234567;ext=8', '++923001234567']) {
    await assert.rejects(db.query('update restaurant_settings set restaurant_phone=$1', [phone]), { code: '23514' });
  }
  const event = (await db.query('select * from admin_activity')).rows[0];
  assert.equal(event.actor_id, admin);
  assert.deepEqual(event.after_data, { minimum_order_amount: 500, restaurant_phone: '+923001234567' });
  const changes = activityChanges({ ...event, action: 'UPDATE' });
  assert.equal(changes.find(change => change.key === 'minimum_order_amount').after[0], 'Rs. 500');
  assert.equal(changes.find(change => change.key === 'restaurant_phone').after[0], '+923001234567');

  await as('service_role');
  // Even a large delivery charge cannot satisfy the minimum food amount.
  await assert.rejects(db.exec('insert into orders(id,subtotal,delivery_charge) values(2,499,5000)'), { code: 'PFC01' });
  await db.exec('insert into orders(id,subtotal,delivery_charge) values(2,500,100),(3,501,100)');
  await db.exec("update orders set status='delivered' where id=1");
  assert.equal((await db.query('select subtotal from orders where id=1')).rows[0].subtotal, 100);

  await as('authenticated', admin);
  await db.exec('update restaurant_settings set minimum_order_amount=1000');
  await as('service_role');
  await assert.rejects(db.exec('insert into orders(id,subtotal) values(4,500)'), { code: 'PFC01' });
  await db.exec("update orders set status='delivered' where id=2");
  await as('authenticated', admin);
  await db.exec('update restaurant_settings set minimum_order_amount=0');
  await as('service_role');
  await db.exec('insert into orders(id,subtotal) values(4,1)');

  await as('authenticated', admin);
  await db.exec('update restaurant_settings set minimum_order_amount=750');
  await db.exec('reset role');
  const auditCount = (await db.query('select count(*) as n from admin_activity')).rows[0].n;
  await db.exec(sql);
  assert.equal((await db.query('select minimum_order_amount from restaurant_settings')).rows[0].minimum_order_amount, 750);
  assert.equal((await db.query('select count(*) as n from admin_activity')).rows[0].n, auditCount);
  await db.exec('delete from admins');
  await as('authenticated', admin);
  assert.equal((await db.query('update restaurant_settings set minimum_order_amount=0 returning id')).rows.length, 0);

  assert.equal(normalizeRestaurantPhone(' +92 (300) 123-4567 '), '+923001234567');
  assert.equal(normalizeRestaurantPhone('0335 2053652'), '03352053652');
  for (const invalid of ['abc', '0300#12345', 'https://example.test', '+1+23456789']) assert.throws(() => normalizeRestaurantPhone(invalid));
  for (const invalid of ['', null, -1, 0.5, NaN, 2000001]) assert.throws(() => parseMinimumOrder(invalid));
  assert.equal(parseMinimumOrder('0'), 0);
  assert.equal(parseMinimumOrder('500'), 500);
  console.log('PASS: restaurant settings RLS, admin revocation, validation, minimum boundaries, delivery excluded, existing orders, audit history and migration reruns');
} finally { await db.close(); }
