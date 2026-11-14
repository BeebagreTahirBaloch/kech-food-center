// Isolated PostgreSQL tests. Never connects to Supabase or uses live data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
const hash = 'a'.repeat(64);
const migrations = await Promise.all([
  '202611100001_restaurant_settings.sql', '202611110001_delivery_request_security.sql',
  '202611110002_public_menu_privileges.sql',
].map(name => readFile('supabase/migrations/' + name, 'utf8')));
const as = async (role, uid = '') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [uid]);
  await db.exec('set role ' + role);
};
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table public.admins(user_id uuid primary key);
    insert into public.admins values ('${owner}');
    create function public.is_admin() returns boolean language sql security definer set search_path='' as $$
      select exists(select 1 from public.admins where user_id=auth.uid()) $$;
    create table public.orders(id integer primary key, subtotal integer);
    create table public.admin_activity(actor_id uuid,action text,entity text,entity_id text,before_data jsonb,after_data jsonb);
    create table public.categories(id integer primary key,name text);
    create table public.menu_items(id integer primary key,name text);
    create table public.item_sizes(id integer primary key,name text);
    create table public.delivery_rates(id boolean primary key, tiers jsonb);
    create table storage.objects(id integer primary key,bucket_id text,name text);
    insert into public.delivery_rates values(true,'[]');
    insert into storage.objects values(1,'menu-images','food.webp'),(2,'other-bucket','other.webp');
  `);
  // Deliberately broad old grants/policies: the new restrictive guards must still
  // stop a normal authenticated customer, even if an old permissive rule exists.
  for (const table of ['categories', 'menu_items', 'item_sizes', 'delivery_rates', 'storage.objects']) {
    await db.exec(`alter table ${table} enable row level security;
      grant all on ${table} to anon,authenticated;
      create policy old_permissive on ${table} for all to anon,authenticated using(true) with check(true);`);
    if (!['delivery_rates', 'storage.objects'].includes(table)) await db.exec(`insert into ${table} values(1,'Original')`);
  }
  for (const sql of migrations) await db.exec(sql);
  for (const sql of migrations.slice(1)) await db.exec(sql);

  await as('anon');
  assert.equal(Number(await scalar('select delivery_radius_km from restaurant_settings')), 15);
  for (const table of ['categories', 'menu_items', 'item_sizes']) {
    assert.equal(await scalar(`select count(*) from ${table}`), 1);
    for (const sql of [`insert into ${table} values(2,'Blocked')`, `update ${table} set name='Blocked'`, `delete from ${table}`]) {
      await assert.rejects(db.exec(sql), { code: '42501' });
    }
  }
  for (const sql of [
    'update restaurant_settings set delivery_radius_km=100', 'select * from delivery_request_buckets',
    `select check_delivery_request('${hash}')`, 'select reserve_delivery_route()',
    "select take_delivery_request_slot('fake',1,60)", "update delivery_rates set tiers='[]'",
  ]) await assert.rejects(db.exec(sql), { code: '42501' });

  await as('authenticated', customer);
  assert.equal((await db.query('update restaurant_settings set delivery_radius_km=100 returning id')).rows.length, 0);
  for (const table of ['categories', 'menu_items', 'item_sizes']) {
    await assert.rejects(db.exec(`insert into ${table} values(2,'Blocked')`), { code: '42501' });
    assert.equal((await db.query(`update ${table} set name='Blocked' returning id`)).rows.length, 0);
    assert.equal((await db.query(`delete from ${table} returning id`)).rows.length, 0);
  }
  assert.equal((await db.query("update delivery_rates set tiers='[1]' returning id")).rows.length, 0);
  for (const sql of ['select * from delivery_request_buckets', `select check_delivery_request('${hash}')`, 'select reserve_delivery_route()']) {
    await assert.rejects(db.exec(sql), { code: '42501' });
  }
  for (const role of ['anon', 'authenticated']) {
    await as(role, customer);
    await assert.rejects(db.exec("insert into storage.objects values(3,'menu-images','blocked.webp')"), { code: '42501' });
    assert.equal((await db.query("update storage.objects set name='blocked.webp' where id=1 returning id")).rows.length, 0);
    assert.equal((await db.query('delete from storage.objects where id=1 returning id')).rows.length, 0);
    await assert.rejects(db.exec("update storage.objects set bucket_id='menu-images' where id=2"), { code: '42501' });
    assert.equal((await db.query("update storage.objects set name='allowed.webp' where id=2 returning id")).rows.length, 1);
  }
  await as('authenticated', owner);
  for (const table of ['categories', 'menu_items', 'item_sizes']) {
    await db.exec(`insert into ${table} values(2,'New'); update ${table} set name='Edited' where id=2; delete from ${table} where id=2;`);
  }
  await db.exec("update delivery_rates set tiers='[{\"maxKm\":null,\"charge\":150}]'");
  await db.exec("insert into storage.objects values(3,'menu-images','new.webp'); update storage.objects set name='replacement.webp' where id=3; delete from storage.objects where id=3;");
  for (const radius of [0, -1, 100.01, 1.001, null]) await assert.rejects(db.query('update restaurant_settings set delivery_radius_km=$1', [radius]));
  await db.exec('update restaurant_settings set delivery_radius_km=22.5');
  await db.exec('reset role');
  const event = (await db.query("select * from admin_activity where entity='restaurant_settings'")).rows.at(-1);
  assert.equal(event.actor_id, owner);
  assert.equal(event.after_data.delivery_radius_km, 22.5);
  await db.exec(migrations[1]);
  assert.equal(Number(await scalar('select delivery_radius_km from restaurant_settings')), 22.5, 'Rerun preserves owner choice');
  assert.equal(await scalar('select count(*) from admin_activity'), 1, 'Rerun creates no fake audit changes');

  await as('service_role');
  await assert.rejects(db.exec("select take_delivery_request_slot('bypass',1,60)"), { code: '42501' });
  for (let n = 0; n < 10; n++) assert.equal((await scalar('select check_delivery_request($1)', [hash])).allowed, true);
  let denied = await scalar('select check_delivery_request($1)', [hash]);
  assert.equal(denied.allowed, false); assert.ok(denied.retryAfter > 0 && denied.retryAfter <= 60);
  await db.exec('reset role');
  await db.exec("update delivery_request_buckets set window_started_at=now()-interval '61 seconds' where bucket like '%minute:%' or bucket='estimate:global'");
  await as('service_role');
  assert.equal((await scalar('select check_delivery_request($1)', [hash])).allowed, true, 'Window resets');
  await db.exec('reset role');
  await db.query("update delivery_request_buckets set requests=100 where bucket=$1", ['estimate:day:' + hash]);
  await as('service_role');
  denied = await scalar('select check_delivery_request($1)', [hash]);
  assert.equal(denied.allowed, false); assert.ok(denied.retryAfter > 60);
  await db.exec('reset role');
  await db.exec('truncate delivery_request_buckets');
  await as('service_role');
  // Different client hashes still share an aggregate cap.
  for (let n = 0; n < 60; n++) assert.equal((await scalar('select check_delivery_request($1)', [n.toString(16).padStart(64, '0')])).allowed, true);
  assert.equal((await scalar('select check_delivery_request($1)', ['f'.repeat(64)])).allowed, false);
  for (let n = 0; n < 30; n++) assert.equal(await scalar('select reserve_delivery_route()'), true);
  assert.equal(await scalar('select reserve_delivery_route()'), false, 'Shared per-minute ORS budget');
  await db.exec('reset role');
  await db.exec("update delivery_request_buckets set window_started_at=now()-interval '61 seconds' where bucket='routing:minute'; update delivery_request_buckets set requests=1000 where bucket='routing:day';");
  await as('service_role');
  assert.equal(await scalar('select reserve_delivery_route()'), false, 'Daily ORS budget');
  await db.exec('reset role');
  await db.exec("update delivery_request_buckets set window_started_at=now()-interval '25 hours' where bucket='routing:day'");
  await as('service_role');
  assert.equal(await scalar('select reserve_delivery_route()'), true);
  await assert.rejects(db.exec("select check_delivery_request('raw-address')"));
  console.log('PASS: migration reruns, radius validation and audit, anon/customer/admin menu and storage privileges, private limit counters, per-client/global/daily routing limits');
} finally { await db.close(); }
