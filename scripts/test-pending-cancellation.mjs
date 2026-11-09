import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create table public.orders (
  id integer primary key, status text, subtotal integer, delivery_charge integer, total integer,
  check ((status in ('pending','awaiting_charge','declined') and total is null)
    or (status in ('quoted','confirmed','out_for_delivery','delivered','cancelled')
      and delivery_charge is not null and total = subtotal + delivery_charge))
);
insert into orders values (1,'pending',500,null,null),(2,'delivered',500,150,650);`);
await assert.rejects(db.exec("update orders set status='cancelled' where id=1"), /check constraint/);
const before = (await db.query('select * from orders order by id')).rows;
const migration = await readFile('supabase/migrations/202611010007_pending_order_cancellation.sql','utf8');
await db.exec(migration);
await db.exec(migration);
assert.deepEqual((await db.query('select * from orders order by id')).rows,before);
await db.exec("update orders set status='cancelled' where id=1");
assert.equal((await db.query('select status from orders where id=1')).rows[0].status,'cancelled');
await assert.rejects(db.exec('update orders set total=999 where id=2'), /check constraint/);
await assert.rejects(db.exec('update orders set total=null where id=2'), /check constraint/);
await db.exec("update orders set status='cancelled' where id=2");
assert.equal((await db.query('select total from orders where id=2')).rows[0].total,650);
await db.close();
console.log('PASS legacy cancellation failure, migration rerun, preserved rows, pending and paid cancellation, total validation');
