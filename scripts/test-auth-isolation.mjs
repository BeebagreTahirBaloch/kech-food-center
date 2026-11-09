import {chromium} from '../.test-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env=await readFile('.env','utf8');const url=env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
const ids={admin:'11111111-1111-4111-8111-111111111111',rider:'22222222-2222-4222-8222-222222222222'};
const session=role=>({access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:ids[role],exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test',refresh_token:'test-'+role,expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:ids[role],email:role+'@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket('**/*',ws=>ws.close());
await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname!==new URL(url).hostname)return route.abort();let data=null;const path=u.pathname,body=route.request().postDataJSON();const auth=route.request().headers().authorization;const admin=auth==='Bearer '+session('admin').access_token; // tokens share an expiry second; decode identity below instead.
let uid='';try{uid=JSON.parse(Buffer.from((auth||'').split('.')[1],'base64url').toString()).sub;}catch{}
if(path.endsWith('/token'))data=session(body.email.startsWith('admin')?'admin':'rider');
else if(path.endsWith('/admins'))data=uid===ids.admin?[{user_id:ids.admin}]:[];
else if(path.endsWith('/is_rider'))data=uid===ids.rider;
else if(path.endsWith('/rider_dashboard'))data={profile:{name:'Test rider',online:false},pending:[],active:null,history:[],today:{delivered:0,charges:0,sales:0},wait_minutes:10};
else if(path.endsWith('/categories')||path.endsWith('/menu_items')||path.endsWith('/push_subscriptions'))data=[];
else if(path.endsWith('/admin-create-rider'))data={telegramEnabled:false};
else if(path.endsWith('/user'))data={id:uid};
else if(path.endsWith('/logout'))data={};
return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try{
const admin=await context.newPage(),rider=await context.newPage();
await admin.goto('http://127.0.0.1:5176/admin');await admin.getByLabel('Email',{exact:true}).fill('admin@example.test');await admin.getByLabel('Password',{exact:true}).fill('test-only-password');await admin.getByRole('button',{name:'Sign in',exact:true}).click();await admin.getByRole('heading',{name:'Manage menu',exact:true}).waitFor();
await rider.goto('http://127.0.0.1:5176/rider');await rider.getByLabel('Email',{exact:true}).fill('rider@example.test');await rider.getByLabel('Password',{exact:true}).fill('test-only-password');await rider.getByRole('button',{name:'Sign in',exact:true}).click();await rider.getByRole('heading',{name:'Test rider',exact:true}).waitFor();
await admin.bringToFront();await admin.waitForTimeout(700);assert.equal(await admin.getByRole('heading',{name:'Manage menu',exact:true}).isVisible(),true);
await rider.bringToFront();await rider.waitForTimeout(700);assert.equal(await rider.getByRole('heading',{name:'Test rider',exact:true}).isVisible(),true);
await admin.reload();await admin.getByRole('heading',{name:'Manage menu',exact:true}).waitFor();await rider.reload();await rider.getByRole('heading',{name:'Test rider',exact:true}).waitFor();
await rider.getByRole('button',{name:'Sign out',exact:true}).click();await rider.getByRole('heading',{name:'KFC Turbat Rider',exact:true}).waitFor();assert.equal(await admin.getByRole('heading',{name:'Manage menu',exact:true}).isVisible(),true);
console.log('PASS: simultaneous admin/rider logins, tab focus, reload persistence, isolated sign-out');
}finally{await browser.close();}
