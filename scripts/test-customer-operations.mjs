import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {reorderLines} from '../src/lib/reorder.js';
import {countdown} from '../src/lib/orderHistory.js';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;create table public.admins(user_id uuid primary key);create function public.is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.admins where user_id=auth.uid())$$;create schema realtime;create table realtime.messages(topic text);create function realtime.topic() returns text language sql as $$select 'rider-orders'::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;grant usage on schema auth to authenticated,anon;grant select on admins to authenticated;`);
await db.exec((await readFile('supabase/schema.sql','utf8')).split('-- Backend menu migration')[0].replace(/create extension[^;]+;/,''));
for(const file of ['202610310001_order_tracking.sql','202610310002_admin_orders.sql','202610310003_free_delivery.sql','202611010001_delivery_estimate.sql','202611010002_rider_operations.sql','202611010003_rider_reports.sql','202611010004_rider_push.sql','202611010006_rider_cancel_after_accept.sql','202611010007_pending_order_cancellation.sql','202611020001_ordering_hours.sql','202611020002_stop_ordering.sql','202611030002_waiting_order_alerts.sql','202611040001_order_cleanup.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
await db.exec(`create table menu_items(id uuid,name text,base_price int,is_available bool);create table item_sizes(id uuid,item_id uuid,label text,price int);create table categories(id uuid,name text);create table delivery_rates(id boolean,tiers jsonb);`);
for(const file of ['202611070001_customer_history.sql','202611070002_customer_owner_alerts.sql']){const sql=await readFile('supabase/migrations/'+file,'utf8');await db.exec(sql);await db.exec(sql);}
const admin='11111111-1111-4111-8111-111111111111',rider='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users values('${admin}'),('${rider}'),('${other}');insert into admins values('${admin}');insert into riders(user_id,name,phone) values('${rider}','Rider','03000000000');`);
const rpc=async(s,args=[]) => (await db.query('select '+s+' as result',args)).rows[0].result;
const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id]);await db.exec('set role '+role);};
const id=(await db.query("insert into orders(customer_name,phone,address,lat,lng,items,subtotal,distance_km,estimated_delivery_charge) values('Hidden name','03000000000','Hidden address',26,63,'[{}]',500,2,100) returning id")).rows[0].id;
await as(other);await assert.rejects(rpc('admin_monthly_sales()'));assert.deepEqual((await db.query('select * from admin_activity')).rows,[]);assert.deepEqual((await db.query('select * from archived_monthly_sales')).rows,[]);
await as(rider);assert.equal(await rpc('accept_order($1)',[id]),'accepted');await rpc('set_quote($1,100,30)',[id]);assert.equal(await rpc("revise_order_eta($1,45,'traffic')",[id]),'updated');
await as(other);await assert.rejects(rpc("revise_order_eta($1,45,'traffic')",[id]));
await as(rider);await rpc('mark_out_for_delivery($1)',[id]);await rpc('mark_delivered($1)',[id]);await assert.rejects(rpc('admin_monthly_sales()'));
await as(admin);let history=await rpc('admin_monthly_sales()');assert.equal(Number(history[0].total_sales),600);
await db.exec('reset role');assert.ok((await db.query('select count(*) n from notification_jobs where order_id=$1',[id])).rows[0].n>=5);
const endpoint='https://fcm.googleapis.com/fcm/send/test',owner='a'.repeat(64);
// Owner-only device registration and tamper-proof, attributable price history.
await as(admin);await rpc('save_push_subscription($1,$2,$3)',[endpoint,'a'.repeat(87),'b'.repeat(22)]);
assert.equal((await db.query('select * from push_subscriptions')).rows.length,1);
await as(other);await assert.rejects(rpc('save_push_subscription($1,$2,$3)',[endpoint,'a'.repeat(87),'b'.repeat(22)]));assert.equal((await db.query('select * from push_subscriptions')).rows.length,0);
await as(rider);await assert.rejects(rpc('save_push_subscription($1,$2,$3)',[endpoint,'a'.repeat(87),'b'.repeat(22)]));
await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[admin]);
await db.query('insert into menu_items values($1,$2,500,true)',[id,'Test item']);await db.query('update menu_items set base_price=700 where id=$1',[id]);
await as(admin);const audit=(await db.query("select * from admin_activity where entity='menu_items' and action='UPDATE'")).rows[0];assert.equal(audit.actor_id,admin);assert.equal(audit.before_data.base_price,500);assert.equal(audit.after_data.base_price,700);await assert.rejects(db.query('delete from admin_activity'));
await db.exec('reset role');
await db.query("update orders set status='pending',rider_id=null,total=null where id=$1",[id]);
await as('', 'service_role');assert.equal(await rpc("customer_push_registration($1,$2,$3,$4,$5,'save')",[id,endpoint,'a'.repeat(87),'b'.repeat(22),owner]),true);
assert.equal(await rpc("customer_push_registration($1,$2,null,null,$3,'status')",[id,endpoint,owner]),true);
await assert.rejects(rpc("customer_push_registration($1,$2,$3,$4,$5,'save')",[id,endpoint,'a'.repeat(87),'b'.repeat(22),'b'.repeat(64)]));
await as('', 'anon');await assert.rejects(db.query('select * from customer_push_subscriptions'));await assert.rejects(db.query('select * from notification_jobs'));await assert.rejects(rpc("customer_push_registration($1,$2,null,null,$3,'status')",[id,endpoint,owner]));await assert.rejects(db.query('select customer_name,phone,address from orders'));
await db.exec('reset role');await db.query("update orders set status='delivered',delivery_charge=100,total=600 where id=$1",[id]);
await as(admin);history=await rpc('admin_monthly_sales()');await db.exec('reset role');await db.query('delete from order_events where order_id=$1',[id]);await db.query('delete from order_push_jobs where order_id=$1',[id]);await db.query('delete from orders where id=$1',[id]);
await as(admin);assert.equal(Number((await rpc('admin_monthly_sales()'))[0].total_sales),Number(history[0].total_sales));
await db.exec('reset role');assert.equal((await db.query('select * from customer_push_subscriptions')).rows.length,0);
const catalog=[{id:'food',name:'Pizza',price:null,is_available:true,options:[{id:'size',label:'Small',price:700}]}];
assert.deepEqual(reorderLines([{productId:'food',name:'Pizza',optionLabel:'Small',quantity:2}],catalog).lines,[{itemId:'food',sizeId:'size',quantity:2}]);
assert.equal(reorderLines([{productId:'deleted',name:'Pizza',quantity:1}],catalog).skipped.length,1);
assert.equal(reorderLines([{productId:'food',name:'Pizza',optionLabel:'Large',quantity:1}],catalog).lines.length,0);
assert.equal(reorderLines([{productId:'food',name:'Pizza',optionLabel:'Small',quantity:1}],[{...catalog[0],price:600,options:[]}]).skipped.length,1);
assert.equal(countdown({status:'confirmed',confirmedAt:'2026-01-01T00:00:00Z',etaMinutes:30},Date.parse('2026-01-01T01:00:00Z')),'Taking longer than estimated');
assert.equal(countdown({status:'confirmed',confirmedAt:'2026-01-01T00:00:00Z',etaMinutes:30,arrivalEtaAt:'2026-01-01T02:00:00Z'},Date.parse('2026-01-01T01:00:00Z')),'60:00');
// Owner emails are resolved for old audit entries through an admin-only RPC.
// The migration must not rewrite those entries or grant direct auth.users access.
await db.exec('reset role');
await db.exec('alter table auth.users add column email text');
await db.query('update auth.users set email=$1 where id=$2',['owner@example.test',admin]);
const originalEvents=(await db.query('select * from admin_activity order by id')).rows;
const activitySql=await readFile('supabase/migrations/202611080002_readable_owner_activity.sql','utf8');
await db.exec(activitySql);await db.exec(activitySql);
assert.deepEqual((await db.query('select * from admin_activity order by id')).rows,originalEvents);
for(const [user,role] of [['','anon'],['','authenticated'],[other,'authenticated'],[rider,'authenticated']]){
 await as(user,role);
 await assert.rejects(db.query('select * from admin_activity_feed()'),{code:'42501'});
 await assert.rejects(db.query('select email from auth.users'),{code:'42501'});
}
await as(admin);
const oldEvent=(await db.query('select * from admin_activity_feed()')).rows.find(e=>e.id===audit.id);
assert.equal(oldEvent.actor_email,'owner@example.test');assert.equal(oldEvent.actor_type,'account');
assert.equal(oldEvent.before_data.base_price,500);assert.equal(oldEvent.after_data.base_price,700);
assert.ok(!('actor_id' in oldEvent));await assert.rejects(db.query('select email from auth.users'),{code:'42501'});
await db.exec('reset role');
const previousCategory='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextCategory='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
await db.query("insert into categories values($1,'Pizzas'),($2,'Burgers')",[previousCategory,nextCategory]);
const categoryEvent=(await db.query("insert into admin_activity(actor_id,entity,action,before_data,after_data) values($1,'menu_items','UPDATE',jsonb_build_object('category_id',$2::text),jsonb_build_object('category_id',$3::text)) returning id",[admin,previousCategory,nextCategory])).rows[0].id;
const removedEvent=(await db.query("insert into admin_activity(actor_id,entity,action) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','ordering_hours','UPDATE') returning id")).rows[0].id;
const systemEvent=(await db.query("insert into admin_activity(entity,action) values('ordering_hours','UPDATE') returning id")).rows[0].id;
await as(admin);
const resolved=(await db.query('select * from admin_activity_feed()')).rows;
assert.equal(resolved.find(e=>e.id===categoryEvent).before_category_name,'Pizzas');
assert.equal(resolved.find(e=>e.id===categoryEvent).after_category_name,'Burgers');
assert.equal(resolved.find(e=>e.id===removedEvent).actor_type,'account_removed');
assert.equal(resolved.find(e=>e.id===systemEvent).actor_type,'system');
await db.exec('reset role');
// Tied timestamps must not duplicate or omit entries between pages.
await db.exec("insert into admin_activity(entity,action,created_at) select 'ordering_hours','UPDATE','2020-01-01'::timestamptz from generate_series(1,105)");
await as(admin);
const allIds=[];
for(let offset=0;offset<150;offset+=25){
 const rows=(await db.query('select * from admin_activity_feed($1,25)',[offset])).rows;
 allIds.push(...rows.map(e=>e.id));if(rows.length<25)break;
}
assert.equal(allIds.length,new Set(allIds).size);
assert.equal(allIds.length,(await db.query('select count(*)::int n from admin_activity')).rows[0].n);
assert.equal((await db.query('select * from admin_activity_feed(0,9999)')).rows.length,100);
assert.equal((await db.query('select * from admin_activity_feed(null,null)')).rows.length,25);
assert.equal((await db.query('select * from admin_activity_feed(-5,0)')).rows.length,1);
assert.equal((await db.query('select * from admin_activity_feed(9999,25)')).rows.length,0);
await db.exec('reset role');await db.query('delete from admins where user_id=$1',[admin]);
await as(admin);await assert.rejects(db.query('select * from admin_activity_feed()'),{code:'42501'});
await db.close();console.log('PASS rerunnable migrations, role security, owner email lookup/paging, ETA, push ownership/outbox, archived sales, reorder and delays');
