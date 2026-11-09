// Strictly local: no network, env files, Telegram, push or production credentials.
import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role;create table orders(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),subtotal int not null);");await db.exec(await readFile('supabase/migrations/202611030001_order_protection.sql','utf8'));
const results=[];let notifications=0;
async function attempt(key,phone){const t=performance.now();const hash=createHash('sha256').update('fake order '+phone).digest('hex');const r=(await db.query('select begin_order_request($1,$2,$3) as r',[key,hash,hash])).rows[0].r;if(r.status==='accepted'){await db.query('insert into orders(subtotal,checkout_request_id) values(500,$1)',[key]);notifications++;}return {status:r.status,ms:performance.now()-t};}
async function batch(name,n,same=false){await db.exec('truncate order_rate_buckets');const before=notifications;const key=randomUUID();const start=performance.now();const rows=await Promise.all(Array.from({length:n},(_,i)=>attempt(same?key:randomUUID(),same?'same':name+i)));const times=rows.map(r=>r.ms).sort((a,b)=>a-b);const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;results.push({scenario:name,requests:n,elapsedMs:Math.round(performance.now()-start),p95Ms:Math.round(times[Math.ceil(n*.95)-1]),counts,newOrders:notifications-before});return counts;}
assert.equal((await batch('10 simultaneous customers',10)).accepted,10);
assert.equal((await batch('20 simultaneous customers',20)).accepted,20);
assert.equal((await batch('20 retries of one checkout',20,true)).accepted,1);
const burst=await batch('100-request burst',100);assert.ok(burst.rate_limited>0);assert.ok(burst.accepted<=35);
// Completed retry returns the same order, without another notification.
await db.exec('truncate order_rate_buckets');const key=randomUUID();await attempt(key,'replay');const before=notifications;assert.equal((await attempt(key,'replay')).status,'replay');assert.equal(notifications,before);
await db.close();await mkdir('.test-results',{recursive:true});const report={scope:'Local PGlite database simulation; concurrent promises are queued by an embedded DB. NOT hosted Supabase/HTTP throughput or capacity. Notification counter is simulated.',results};await writeFile('.test-results/order-load-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
