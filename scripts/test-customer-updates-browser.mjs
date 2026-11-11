import {chromium} from '../.test-tools/node_modules/playwright/index.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=await readFile('.env','utf8'),host=new URL(env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname;
const base='http://127.0.0.1:5182',id='11111111-1111-4111-8111-111111111111',food='22222222-2222-4222-8222-222222222222',riderId='33333333-3333-4333-8333-333333333333';
let status='confirmed',commitDelivery=false,deliveryCalls=0,allowAdmin=false,activityFails=false;
let orderOverrides={},cancelCalls=0,hereCalls=0;
const created=new Date(Date.now()-7200000).toISOString();
const order=()=>({id,status,createdAt:created,confirmedAt:created,etaMinutes:30,subtotal:500,estimatedDeliveryCharge:150,deliveryCharge:100,total:600,lat:26,lng:63,distanceKm:3.9,items:[{productId:food,name:'Test Pizza',optionLabel:'Small',quantity:2,unitPrice:250},{productId:'deleted',name:'Old drink',quantity:1}],rider:{name:'Test rider',phone:'03000000000'},...orderOverrides});
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:riderId,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test',refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:riderId,email:'test@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};
const active=()=>({id,status,created_at:created,confirmed_at:created,eta_minutes:30,customer_name:'Test customer',phone:'03000000000',address:'Test address',items:[],subtotal:500,delivery_charge:100,total:600});
const activityEvents=[
 {id:'price',entity:'menu_items',before_data:{id:food,name:'Test Pizza',base_price:500,is_available:true},after_data:{id:food,name:'Test Pizza',base_price:700,is_available:true}},
 {id:'schedule',entity:'ordering_hours',before_data:{id:true,paused:false,enabled:false,opens_at:'16:00:00',closes_at:'23:59:00'},after_data:{id:true,paused:false,enabled:true,opens_at:'16:00:00',closes_at:'23:59:00'}},
 {id:'times',entity:'ordering_hours',before_data:{opens_at:'16:00:00',closes_at:'00:00:00'},after_data:{opens_at:'19:27:00',closes_at:'23:59:00'}},
 {id:'rates',entity:'delivery_rates',before_data:{tiers:[{maxKm:5,charge:100},{maxKm:null,charge:300}]},after_data:{tiers:[{maxKm:5,charge:0},{maxKm:8,charge:150},{maxKm:null,charge:300}]}},
 {id:'capacity',entity:'rider_capacity',before_data:{max_active_orders:3,nearby_order_km:1},after_data:{max_active_orders:5,nearby_order_km:2}},
].map(e=>({...e,actor_email:'restaurant.owner@example.test',actor_type:'account',action:'UPDATE',created_at:'2026-11-08T17:41:30Z'}));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(({id,created,host,session})=>{sessionStorage.setItem('kech-ad-seen','true');localStorage.setItem('kfc_my_orders',JSON.stringify([{id,time:created,subtotal:500}]));localStorage.setItem('kfc-'+host+'-rider',JSON.stringify(session));},{id,created,host,session});
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname!==host)return route.abort();const p=u.pathname;let data=null;
 if(p.endsWith('/categories'))data=[{id:'pizza',name:'Pizza',sort_order:0},{id:'burgers',name:'Burgers',sort_order:1}];
 else if(p.endsWith('/menu_items'))data=[{id:food,name:'Test Pizza',category_id:'pizza',base_price:null,is_available:true,is_deleted:false,item_sizes:[{id:'small',label:'Small',price:700,sort_order:0}]},{id:'burger',name:'Test Burger',category_id:'burgers',base_price:450,is_available:true,is_deleted:false,item_sizes:[]}];
 else if(p.endsWith('/get-order'))data={order:order()};
 else if(p.endsWith('/cancel-order')){assert.deepEqual(route.request().postDataJSON(),{orderId:id});cancelCalls++;status='cancelled';data={cancelled:true};}
 else if(p.endsWith('/customer-here')){assert.deepEqual(route.request().postDataJSON(),{orderId:id});hereCalls++;orderOverrides.customerHereUsed=true;orderOverrides.customerHereAt=new Date().toISOString();data={ok:true};}
 else if(p.endsWith('/rider_availability'))data={noneOnline:true,allBusy:false};
 else if(p.endsWith('/is_rider'))data=true;
 else if(p.endsWith('/rider_dashboard'))data={profile:{name:'Test rider',online:true},pending:[],active:status==='delivered'?null:active(),history:status==='delivered'?[active()]:[],today:{delivered:0,charges:0,sales:0},wait_minutes:10};
 else if(p.endsWith('/mark_delivered')){deliveryCalls++;if(commitDelivery)status='delivered';return route.abort('failed');}
 else if(p.endsWith('/admins'))data=allowAdmin?[{user_id:riderId}]:[];
 else if(p.endsWith('/admin_waiting_orders'))data={count:0,orders:[],threshold:10};
 else if(p.endsWith('/admin_monthly_sales'))data=[{month:'2026-11-01',orders:3,delivered:2,cancelled:1,food_sales:1000,delivery_charges:200,total_sales:1200}];
 else if(p.endsWith('/admin_activity_feed')){
  assert.equal(allowAdmin,true,'Activity requested before admin authorization');
  assert.deepEqual(route.request().postDataJSON(),{p_offset:0,p_limit:25});
  if(activityFails)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Test unavailable'})});
  data=activityEvents;
 }
 else if(p.endsWith('/user'))data=session.user;
 else if(p.endsWith('/push_subscriptions'))data=[];
 else if(p.endsWith('/ordering_hours'))data={enabled:false,paused:false,opens_at:'00:00',closes_at:'23:59'};
 else if(p.endsWith('/delivery_rates'))data={tiers:[{maxKm:5,charge:100},{maxKm:null,charge:300}]};
 else if(p.endsWith('/restaurant_settings'))data={minimum_order_amount:0,restaurant_phone:'03352053652'};
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const fits=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow');
try{
 await page.goto(base);await page.getByLabel('Find your food').fill('burger');await page.getByRole('button',{name:/Test Burger/}).waitFor();assert.equal(await page.getByRole('button',{name:/Test Pizza/}).count(),0);await fits();
 await page.getByLabel('Find your food').fill('missing-food');await page.getByText('No food matches your search.').waitFor();
 await page.goto(base+'/orders');
 const orderedItems=page.getByRole('list',{name:'Ordered items'});
 await orderedItems.getByText('Test Pizza',{exact:true}).waitFor();
 assert.equal(await orderedItems.locator('li').count(),2);
 await orderedItems.locator('li').first().getByText('2 ×',{exact:true}).waitFor();
 await orderedItems.locator('li').first().getByText('Small',{exact:true}).waitFor();
 await orderedItems.locator('li').first().getByText('Rs. 500',{exact:true}).waitFor();
 await orderedItems.getByText('Old drink',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Order again',exact:true}).click();await page.getByText(/Unavailable: Old drink/).waitFor();assert.match(await page.locator('body').innerText(),/1,400/);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('cart'))),[{itemId:food,sizeId:'small',quantity:2}]);await fits();
 await page.goto(base+'/track/'+id);await page.getByText('Taking longer than estimated',{exact:true}).waitFor();assert.ok(await page.getByRole('link',{name:'Call rider',exact:true}).isVisible());await fits();
 assert.equal(await page.getByRole('heading',{name:'Your rider accepted your order',exact:true}).count(),1);
 const alertSettings=page.locator('.tracking-alert-settings');
 assert.equal(await page.getByRole('button',{name:'Notify me about this order'}).isVisible(),false);
 assert.ok((await page.getByRole('link',{name:'Call rider',exact:true}).boundingBox()).y<650,'Rider contact is near the top');
 await mkdir('.test-results',{recursive:true});await page.screenshot({path:'.test-results/customer-delay-mobile.png',fullPage:true});
 await page.locator('.tracking-order-details > summary').click();await page.getByText('Estimated Rs. 150 → Final Rs. 100',{exact:true}).waitFor();await page.getByText('Subtotal',{exact:true}).waitFor();
 await page.locator('.tracking-location > summary').click();await page.locator('.tracking-map .leaflet-marker-icon').waitFor();await page.locator('.tracking-location > summary').click();
 await alertSettings.locator(':scope > summary').click();await page.getByRole('button',{name:'Enable sound and alerts'}).waitFor();await page.getByRole('button',{name:'Notify me about this order'}).waitFor();
 await alertSettings.locator(':scope > summary').click();await page.locator('.tracking-order-details > summary').click();
 orderOverrides={confirmedAt:new Date().toISOString()};await page.reload();await page.getByRole('timer').waitFor();
 await page.screenshot({path:'.test-results/tracking-accepted-mobile.png',fullPage:true});
 await page.setViewportSize({width:320,height:844});await fits();
 await page.setViewportSize({width:1280,height:900});await fits();await page.screenshot({path:'.test-results/tracking-accepted-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 // Existing single-order refreshes must still notify even with alert settings closed.
 const refreshTracking=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/get-order'));await page.evaluate(()=>window.dispatchEvent(new Event('online')));await response;};
 status='out_for_delivery';await refreshTracking();await page.getByRole('heading',{name:'Your order is on the way',exact:true}).waitFor();
 await page.locator('.order-alert-banner').getByText('Your order is on the way',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Close: Your order is on the way'}).click();await refreshTracking();assert.equal(await page.locator('.order-alert-banner').count(),0);
 orderOverrides.arrivedAt=new Date().toISOString();await refreshTracking();await page.getByRole('heading',{name:'Your rider has arrived'}).waitFor();assert.equal(await page.getByRole('timer').count(),0);
 await page.getByRole('button',{name:"I'm here",exact:true}).click();await page.getByText('Your response was recorded. The wait time has restarted.').waitFor();assert.equal(hereCalls,1);
 status='delivered';await refreshTracking();await page.getByRole('heading',{name:'Your order was delivered. Enjoy your meal!',exact:true}).waitFor();assert.equal(await page.getByRole('timer').count(),0);assert.equal(await page.locator('.tracking-alert-settings').count(),0);assert.equal(await page.getByRole('button',{name:'Cancel order',exact:true}).count(),0);await fits();
 status='pending';orderOverrides={confirmedAt:null,deliveryCharge:null,total:null,rider:null};await page.reload();await page.getByText(/No riders are online right now/).waitFor();
 assert.doesNotMatch(await page.locator('main').innerText(),/You can still place your order/);await page.getByRole('link',{name:'Call restaurant',exact:true}).waitFor();await fits();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cancel order',exact:true}).click();await page.getByRole('heading',{name:'Your order was cancelled',exact:true}).waitFor();assert.equal(cancelCalls,1);assert.equal(await page.getByRole('button',{name:'Cancel order',exact:true}).count(),0);
 orderOverrides={};
 status='out_for_delivery';await page.goto(base+'/rider');await page.getByRole('heading',{name:'Test rider',exact:true}).waitFor();await page.getByRole('button',{name:/^My active orders/}).click();page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Delivered',exact:true}).click();await page.getByText(/The last change was not confirmed/).waitFor();assert.equal(deliveryCalls,1);assert.ok(await page.getByRole('button',{name:'Delivered',exact:true}).isVisible());
 commitDelivery=true;await page.getByRole('button',{name:'Delivered',exact:true}).click();await page.getByText('Saved — confirmed after reconnecting.',{exact:true}).waitFor();await page.getByText('Ready for the next order',{exact:true}).waitFor();assert.equal(deliveryCalls,2);await fits();
 await page.screenshot({path:'.test-results/rider-recovery-mobile.png',fullPage:true});
 await page.goto(base+'/admin/history');await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Monthly totals'}).count(),0);
 await page.evaluate(({host,session})=>localStorage.setItem('kfc-'+host+'-admin',JSON.stringify(session)),{host,session});await page.reload();await page.getByText('Not authorized',{exact:true}).waitFor();
 allowAdmin=true;await page.evaluate(({host,session})=>localStorage.setItem('kfc-'+host+'-admin',JSON.stringify(session)),{host,session});await page.reload();await page.getByRole('heading',{name:'Monthly totals'}).waitFor();await page.getByText('Rs. 1,200',{exact:true}).waitFor();
 const activity=page.getByRole('region',{name:'Owner activity'}),entries=activity.locator('.activity-entry');
 assert.equal(await activity.getByText('restaurant.owner@example.test',{exact:true}).count(),5);
 for(const entry of await entries.all())await entry.locator('summary').click();
 assert.equal(await entries.nth(0).locator('dt').count(),1);await entries.nth(0).getByText('Rs. 700',{exact:true}).waitFor();
 assert.equal(await entries.nth(1).locator('dt').count(),1);await entries.nth(1).getByText('Ordering schedule',{exact:true}).waitFor();
 assert.equal(await entries.nth(1).locator('.activity-before .activity-value').innerText(),'Off');assert.equal(await entries.nth(1).locator('.activity-after .activity-value').innerText(),'On');
 for(const time of ['4:00 PM','7:27 PM','12:00 AM','11:59 PM'])await entries.nth(2).getByText(time,{exact:true}).waitFor();
 assert.match(await entries.nth(1).locator('time').innerText(),/10:41:30 pm/);
 await entries.nth(3).getByText('0–5 km · Rs. 0',{exact:true}).waitFor();await entries.nth(3).getByText('Over 5–8 km · Rs. 150',{exact:true}).waitFor();
 await entries.nth(4).getByText('2 km',{exact:true}).waitFor();
 assert.doesNotMatch(await activity.innerText(),/Actor ID|base_price|ordering_hours|User [0-9a-f]{8}|33333333|customer_name|Test address/);assert.equal(await activity.locator('pre').count(),0);
 assert.equal(await page.getByRole('link',{name:'Kitchen',exact:true}).count(),0);await fits();await activity.screenshot({path:'.test-results/owner-history-mobile.png'});
 await page.setViewportSize({width:320,height:844});await fits();
 await page.setViewportSize({width:1280,height:900});await fits();await activity.screenshot({path:'.test-results/owner-history-desktop.png'});
 activityFails=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText(/Unable to load history/).waitFor();assert.equal(await page.getByText('Loading history…',{exact:true}).count(),0);
 activityFails=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('heading',{name:'Owner activity'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS mobile search, reorder, delays, rider recovery, protected owner email/activity display, responsive layout and history error recovery');
}finally{await browser.close();}
