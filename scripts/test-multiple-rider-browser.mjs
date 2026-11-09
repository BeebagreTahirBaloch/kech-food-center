import {chromium} from '../.test-tools/node_modules/playwright/index.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {batchProblem,dropDistance} from '../src/lib/riderBatch.js';
const env=await readFile('.env','utf8'),host=new URL(env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname;
const base='http://127.0.0.1:5182',rider='33333333-3333-4333-8333-333333333333';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'];
const orders=ids.map((id,i)=>({id,status:'pending',lat:26+(i===2?.1:i*.001),lng:63,address:'Test stop '+(i+1),customer_name:'Test customer '+(i+1),phone:'03000000000',subtotal:500,estimated_delivery_charge:100,total:600,delivery_charge:100,created_at:new Date().toISOString(),items:[{name:'Pizza',quantity:1}],call_count:0}));
assert.ok(dropDistance(orders[0],orders[1])<1);assert.ok(batchProblem([],orders,3,1));
let acceptCalls=0,lastArgs,capacity=2;const mutations=[];
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:rider,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test',refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:rider,email:'test@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(({host,session})=>localStorage.setItem('kfc-'+host+'-rider',JSON.stringify(session)),{host,session});
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname!==host)return route.abort();const p=u.pathname;let result=null;
 if(p.endsWith('/is_rider'))result=true;
 else if(p.endsWith('/rider_dashboard')){const active=orders.filter(o=>!['pending','delivered','cancelled'].includes(o.status));result={profile:{name:'Test rider',online:true},pending:orders.filter(o=>o.status==='pending'),active:active[0]||null,activeOrders:active,maxActiveOrders:capacity,nearbyOrderKm:1,history:orders.filter(o=>['delivered','cancelled'].includes(o.status)),today:{delivered:0,charges:0,sales:0},wait_minutes:10};}
 else if(p.endsWith('/accept_orders')){acceptCalls++;lastArgs=route.request().postDataJSON();lastArgs.p_order_ids.forEach(id=>orders.find(o=>o.id===id).status='awaiting_charge');result={status:'accepted',orderIds:lastArgs.p_order_ids};}
 else if(['/set_quote','/mark_out_for_delivery','/mark_delivered','/rider_cancel_order'].some(x=>p.endsWith(x))){const args=route.request().postDataJSON(),o=orders.find(x=>x.id===args.order_id);mutations.push({action:p.split('/').pop(),id:o.id});if(p.endsWith('/set_quote')){o.status='confirmed';o.eta_minutes=args.minutes;}else if(p.endsWith('/mark_out_for_delivery'))o.status='out_for_delivery';else if(p.endsWith('/mark_delivered'))o.status='delivered';else o.status='cancelled';result=o.status==='cancelled'?'cancelled':'updated';}
 else if(p.endsWith('/user'))result=session.user;
 else if(['/categories','/menu_items','/push_subscriptions'].some(x=>p.endsWith(x)))result=[];
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try{
 await page.goto(base+'/rider');await page.getByLabel('Select order 11111111').check();await page.getByLabel('Select order 22222222').check();assert.equal(await page.getByLabel('Select order 44444444').isDisabled(),true);
 await page.getByRole('button',{name:'Accept selected (2)',exact:true}).click();await page.getByRole('heading',{name:'Active deliveries (2)',exact:true}).waitFor();assert.equal(acceptCalls,1);assert.deepEqual(lastArgs.p_order_ids,ids.slice(0,2));
 await page.getByRole('button',{name:'Set delivery time',exact:true}).click();await page.getByRole('button',{name:'Out for delivery',exact:true}).click();await page.getByRole('button',{name:'Delivered',exact:true}).click();await page.getByRole('heading',{name:'Active deliveries (1)',exact:true}).waitFor();assert.equal(orders[1].status,'awaiting_charge');assert.equal(orders[0].status,'delivered');
 assert.ok(mutations.every(x=>x.id===ids[0]));
 await mkdir('.test-results',{recursive:true});await page.screenshot({path:'.test-results/rider-multiple-orders-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Cancel order',exact:true}).click();await page.locator('.rider-cancel-area select').selectOption('other');await page.getByLabel(/Note/).fill('Unable to deliver this stop');await page.getByRole('button',{name:'Confirm cancellation',exact:true}).click();await page.getByText('Ready for the next order',{exact:true}).waitFor();assert.equal(orders[0].status,'delivered');assert.equal(orders[1].status,'cancelled');assert.equal(orders[2].status,'pending');
 capacity=3;orders.forEach((o,i)=>{o.status='pending';o.lat=26+i*.001;});await page.getByRole('button',{name:'Refresh and check saved state',exact:true}).click();await page.getByRole('button',{name:'New orders',exact:true}).click();
 for(const id of ids)await page.getByLabel('Select order '+id.slice(0,8)).check();await page.getByRole('button',{name:'Accept selected (3)',exact:true}).click();await page.getByRole('heading',{name:'Active deliveries (3)',exact:true}).waitFor();assert.equal(acceptCalls,2);assert.deepEqual(lastArgs.p_order_ids,ids);await page.screenshot({path:'.test-results/rider-three-orders-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS mobile two/three-order batch selection, separate delivery/cancellation controls, remaining-order visibility and no layout overflow');
}finally{await browser.close();}
