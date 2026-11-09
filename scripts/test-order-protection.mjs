import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec("create role anon;create role authenticated;create role service_role;create table orders(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),subtotal int not null);");
const sql=await readFile('supabase/migrations/202611030001_order_protection.sql','utf8');await db.exec(sql);await db.exec(sql);
const hash='a'.repeat(64),phone='b'.repeat(64);
const begin=async(key,h=hash,p=phone)=>(await db.query('select begin_order_request($1,$2,$3) as r',[key,h,p])).rows[0].r;
const release=(key,lease)=>db.query('select release_order_request($1,$2)',[key,lease]);
const id=randomUUID();let r=await begin(id);assert.equal(r.status,'accepted');
assert.equal((await begin(id)).status,'in_progress');assert.equal((await begin(id,'c'.repeat(64))).status,'conflict');
await release(id,randomUUID());assert.equal((await begin(id)).status,'in_progress');
await release(id,r.leaseId);r=await begin(id);assert.equal(r.status,'accepted');
const inserted=(await db.query('insert into orders(subtotal,checkout_request_id) values(500,$1) returning id',[id])).rows[0];
await assert.rejects(db.query('insert into orders(subtotal,checkout_request_id) values(500,$1)',[id]),/unique/);
const replay=await begin(id);assert.equal(replay.status,'replay');assert.equal(replay.orderId,inserted.id);assert.equal(replay.subtotal,500);
assert.deepEqual(Object.keys(replay).sort(),['createdAt','orderId','status','subtotal']);
// A new key means a new intentional order; too many attempts on one phone are refused.
await db.exec('truncate order_rate_buckets');
for(let i=0;i<5;i++)assert.equal((await begin(randomUUID())).status,'accepted');
assert.equal((await begin(randomUUID())).status,'rate_limited');
await db.exec("update order_rate_buckets set updated_at=now()-interval '61 seconds' where bucket like 'phone:%'");
assert.equal((await begin(randomUUID())).status,'accepted');
await db.exec('truncate order_rate_buckets');
const expired=randomUUID();const lease1=await begin(expired);await db.query("update order_request_keys set lease_until=now()-interval '1 second' where request_key=$1",[expired]);const lease2=await begin(expired);assert.notEqual(lease2.leaseId,lease1.leaseId);await release(expired,lease1.leaseId);assert.equal((await begin(expired)).status,'in_progress');
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(begin(randomUUID()));await assert.rejects(db.query('select * from order_request_keys'));await assert.rejects(db.query('select * from order_rate_buckets'));await assert.rejects(release(id,r.leaseId));await db.exec('reset role');}
await db.exec('set role service_role');await assert.rejects(db.query("select take_order_token('x',999,999)"));await db.exec('reset role;truncate order_rate_buckets');await db.exec('set role service_role');assert.equal((await begin(id)).status,'replay');await db.exec('reset role');
await db.close();console.log('PASS replay, conflicts, uniqueness, lease recovery, stale release, phone rate/refill, role protection, migration reruns');
