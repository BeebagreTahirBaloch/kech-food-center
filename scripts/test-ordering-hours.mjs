import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create table orders(id int primary key,status text);create function public.is_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'false')='true' $$;`);
const sql=await readFile('supabase/migrations/202611020001_ordering_hours.sql','utf8');
await db.exec(sql);await db.exec(sql);
const status=async()=> (await db.query('select ordering_status() as s')).rows[0].s;
assert.equal((await status()).isOpen,true);
await db.exec("insert into orders values(1,'pending')");
// Fix the database clock in the function definition ONLY in this isolated test database.
const definition=sql.slice(sql.indexOf('create or replace function public.ordering_status()'),sql.indexOf('revoke all on function public.ordering_status()'));
async function at(local){await db.exec(definition.replaceAll('statement_timestamp()',`timestamptz '2026-11-02 ${local}+05'`));}
await db.exec("update ordering_hours set enabled=true,opens_at='12:00',closes_at='23:00'");
for(const [time,open] of [['11:59',false],['12:00',true],['22:59',true],['23:00',false]]){await at(time);assert.equal((await status()).isOpen,open);}
await assert.rejects(db.exec("insert into orders values(2,'pending')"),/Ordering is currently closed/);
await db.exec("update orders set status='delivered' where id=1");
await db.exec("update ordering_hours set opens_at='18:00',closes_at='02:00'");
for(const [time,open] of [['18:00',true],['23:59',true],['00:01',true],['01:59',true],['02:00',false],['12:00',false]]){await at(time);assert.equal((await status()).isOpen,open);}
await assert.rejects(db.exec("update ordering_hours set closes_at=opens_at"));
await db.exec('set role anon');assert.equal((await status()).enabled,true);await assert.rejects(db.exec('select * from ordering_hours'));await assert.rejects(db.exec('update ordering_hours set enabled=false'));
await db.exec('reset role;set role authenticated');assert.equal((await db.query('select * from ordering_hours')).rows.length,0);assert.equal((await db.query('update ordering_hours set enabled=false returning id')).rows.length,0);
await db.exec("reset role;select set_config('test.admin','true',false);set role authenticated;update ordering_hours set enabled=false");assert.equal((await status()).isOpen,true);
await db.exec('reset role');
const pauseSql=await readFile('supabase/migrations/202611020002_stop_ordering.sql','utf8');
await db.exec(pauseSql);await db.exec(pauseSql);
assert.equal((await status()).isOpen,true);
await db.exec('set role authenticated;update ordering_hours set paused=true');
assert.equal((await status()).paused,true);assert.equal((await status()).isOpen,false);
await db.exec('reset role');
await assert.rejects(db.exec("insert into orders values(3,'pending')"),/Ordering is currently closed/);
await db.exec("update orders set status='delivered' where id=1");
await db.exec("select set_config('test.admin','false',false);set role authenticated");
assert.equal((await db.query('update ordering_hours set paused=false returning id')).rows.length,0);
await db.exec("reset role;update ordering_hours set paused=false,enabled=false;insert into orders values(4,'pending')");
assert.equal((await status()).isOpen,true);
// Resume still respects a closed scheduled window.
await db.exec("update ordering_hours set enabled=true,opens_at='12:00',closes_at='13:00'");
const pauseDefinition=pauseSql.slice(pauseSql.indexOf('create or replace function public.ordering_status()'),pauseSql.indexOf('revoke all on function'));
await db.exec(pauseDefinition.replaceAll('statement_timestamp()',"timestamptz '2026-11-02 14:00+05'"));
assert.equal((await status()).isOpen,false);
await db.close();console.log('PASS daily/overnight boundaries, closed insert rejection, existing orders preserved, admin-only updates, public safe status, reruns');
