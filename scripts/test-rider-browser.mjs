import {chromium} from '../.test-tools/node_modules/playwright/index.mjs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=await readFile('.env','utf8');const projectUrl=env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];assert.ok(projectUrl);
const ref=new URL(projectUrl).hostname.split('.')[0];const uid='22222222-2222-4222-8222-222222222222';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
const session={access_token:token,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,email:'rider@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};
const id='44444444-4444-4444-8444-444444444444';const order={id,status:'pending',items:[{name:'Pizza',optionLabel:'Small',quantity:1,lineTotal:500}],subtotal:500,distance_km:6,estimated_delivery_charge:150,lat:26,lng:63,created_at:new Date().toISOString()};
let role='rider',active=null;const profile={user_id:uid,name:'Test rider',phone:'123456789',active:true,online:true,created_at:new Date().toISOString()};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.routeWebSocket('**/*',ws=>ws.close());
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();
 if(url.hostname!==new URL(projectUrl).hostname)return route.abort();
 let data={},status=200;const path=url.pathname;const body=route.request().postDataJSON?.();
 if(path.endsWith('/is_rider'))data=role==='rider';
 else if(path.endsWith('/rider_dashboard'))data={profile,pending:active?[]:[order],active,history:[],today:{delivered:0,charges:0,sales:0},wait_minutes:10};
 else if(path.endsWith('/accept_order')){active={...order,rider_id:uid,accepted_at:new Date().toISOString(),status:'awaiting_charge',customer_name:'Test customer',phone:'123456789',address:'Test delivery address',call_count:0};data='accepted';}
 else if(path.endsWith('/set_quote')){active={...active,delivery_charge:body.charge,total:500+body.charge,eta_minutes:body.minutes,status:'confirmed',confirmed_at:new Date().toISOString()};data='updated';}
 else if(path.endsWith('/mark_out_for_delivery')){active={...active,status:'out_for_delivery'};data='updated';}
 else if(path.endsWith('/admins'))data=role==='admin'?[{user_id:uid}]:[];
 else if(path.endsWith('/riders'))data=[profile];
 else if(path.endsWith('/delivery_settings'))data={id:true,wait_minutes:10,cancel_rate_threshold:20};
 else if(path.endsWith('/admin_orders_report_v2'))data={orders:[{...order,...active,rider_name:profile.name}],count:1,periods:{'Orders today':1},summary:{Delivered:0,'Total sales':0},riders:[{...profile,delivered:0,cancelled:0,cancel_rate:0,delivery_charges:0,total_sales:0,average_minutes:0,has_active:true}],cancel_threshold:20};
 else if(path.endsWith('/get-order'))data={order:{id,status:'out_for_delivery',items:order.items,subtotal:500,distanceKm:6,estimatedDeliveryCharge:150,deliveryCharge:200,total:700,etaMinutes:30,confirmedAt:new Date().toISOString(),arrivedAt:new Date().toISOString(),waitMinutes:10,rider:{name:'Test rider',phone:'123456789'}}};
 else if(path.endsWith('/admin-create-rider'))data={telegramEnabled:false};
 else if(path.endsWith('/categories')||path.endsWith('/menu_items')||path.endsWith('/push_subscriptions'))data=[];
 else if(path.includes('/auth/v1/user'))data=session.user;
 else if(path.includes('/auth/v1/logout'))data={};
 else data=null;
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
});
await context.addInitScript(({ref,session})=>{localStorage.setItem(`kfc-${ref}.supabase.co-admin`,JSON.stringify(session));localStorage.setItem(`kfc-${ref}.supabase.co-rider`,JSON.stringify(session));},{ref,session});
await mkdir('.test-results',{recursive:true});
try{
 await page.goto('http://127.0.0.1:5176/rider');await page.getByRole('heading',{name:'Test rider',exact:true}).waitFor();await page.getByRole('button',{name:'Accept',exact:true}).click();await page.getByText('Test delivery address',{exact:true}).waitFor();await page.getByRole('button',{name:'Set charge and time'}).click();await page.getByRole('button',{name:'Out for delivery',exact:true}).click();await page.getByRole('button',{name:"I've arrived",exact:true}).waitFor();await page.getByRole('button',{name:'Cancel order',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Confirm cancellation',exact:true}).isDisabled(),true);await page.screenshot({path:'.test-results/rider-phone.png',fullPage:true});
 role='admin';await page.goto('http://127.0.0.1:5176/admin/riders');await page.getByRole('heading',{name:'Add rider'}).waitFor();await page.screenshot({path:'.test-results/admin-riders-phone.png',fullPage:true});
 await page.goto('http://127.0.0.1:5176/admin/orders');await page.getByRole('heading',{name:'Per-rider report'}).waitFor();await page.setViewportSize({width:1440,height:1000});await page.locator('.orders-list-panel').screenshot({path:'.test-results/orders-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('.orders-list-panel').screenshot({path:'.test-results/orders-mobile.png'});await page.getByRole('button',{name:id.slice(0,8),exact:true}).click();await page.getByRole('button',{name:'Release order'}).waitFor();await page.screenshot({path:'.test-results/admin-details-phone.png',fullPage:true});
 await page.goto('http://127.0.0.1:5176/track/'+id);await page.getByRole('button',{name:"I'm here",exact:true}).waitFor();await page.getByRole('link',{name:'Call rider',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'CONFIRM ORDER',exact:true}).count(),0);await page.screenshot({path:'.test-results/tracking-phone.png',fullPage:true});
 await page.goto('http://127.0.0.1:5176/rider');await page.getByText('Not authorized',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS mocked phone browser flows: rider acceptance/quote, cancellation gating, admin riders/report/details, customer arrival, wrong-role refusal');
}finally{await browser.close();}
