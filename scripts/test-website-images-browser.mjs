import { chromium } from '../.test-tools/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const env=await readFile('.env','utf8');
const host=new URL(env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname;
const id='11111111-1111-4111-8111-111111111111';
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id,email:'test@example.test',aud:'authenticated',role:'authenticated'}};
const picture=await sharp({create:{width:1800,height:900,channels:3,background:'#b21f1f'}}).png().toBuffer();
const oldPath=`website/hero/${id}.webp`;
let rows=[{slot:'hero',image_path:oldPath},{slot:'popup',image_path:null}],uploads=0,deleted=[],failUpload=false,failSave=false,failRead=false;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.addInitScript(({host,session})=>localStorage.setItem(`kfc-${host}-admin`,JSON.stringify(session)),{host,session});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname!==host)return route.abort();
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.includes('/storage/v1/object/public/'))return route.fulfill({contentType:'image/png',body:picture});
  if(path.includes('/storage/v1/object/')){
    if(req.method()==='DELETE'){deleted.push(...req.postDataJSON().prefixes);return reply([]);}
    uploads++;return failUpload?reply({message:'Test failed'},403):reply({Key:path});
  }
  if(path.endsWith('/website_images')){
    if(req.method()==='PATCH'){
      assert.equal(req.headers().authorization,'Bearer '+session.access_token);
      if(failSave)return reply({message:'Test failed'},500);
      const slot=url.searchParams.get('slot').slice(3),old=rows.find(r=>r.slot===slot);
      assert.equal(url.searchParams.get('image_path'),old.image_path?'eq.'+old.image_path:'is.null');
      Object.assign(old,req.postDataJSON());return reply(old);
    }
    return failRead?reply({message:'Test failed'},500):reply(rows);
  }
  if(path.endsWith('/admins'))return reply([{user_id:id}]);
  if(path.endsWith('/user'))return reply(session.user);
  if(path.endsWith('/restaurant_settings'))return reply({minimum_order_amount:0,restaurant_phone:'03000000000',delivery_radius_km:15});
  if(path.endsWith('/ordering_hours'))return reply({enabled:false,paused:false,opens_at:'12:00',closes_at:'23:00'});
  if(path.endsWith('/ordering_status'))return reply({isOpen:true});
  if(path.endsWith('/delivery_rates'))return reply({tiers:[{maxKm:null,charge:100}]});
  if(path.endsWith('/delivery_settings'))return reply({max_active_orders:3,nearby_order_km:1});
  if(path.endsWith('/admin_waiting_orders'))return reply({count:0,orders:[],threshold:10});
  if(path.endsWith('/categories')||path.endsWith('/menu_items'))return reply([]);
  return reply(null);
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5182/admin/settings');
  const panel=page.getByRole('region',{name:'Website images'}),hero=panel.getByRole('article',{name:'Homepage hero image'}),popup=panel.getByRole('article',{name:'Welcome popup image'});
  const file={name:'banner.png',mimeType:'image/png',buffer:picture};
  await hero.getByLabel('Choose hero image').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await hero.getByRole('alert').waitFor();assert.equal(uploads,0);
  await hero.getByLabel('Choose hero image').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(2*1024*1024+1)});
  await hero.getByText('Image must be 2 MB or smaller.').waitFor();
  await hero.getByLabel('Choose hero image').setInputFiles(file);
  await hero.getByAltText('Homepage hero image preview').waitFor();
  await page.waitForFunction(()=>document.querySelector('img[alt="Homepage hero image preview"]')?.naturalWidth===1000);
  assert.equal(uploads,0,'Preview does not publish');
  await hero.getByRole('button',{name:'Save hero image'}).click();
  await hero.getByText(/Homepage hero image saved/).waitFor();
  assert.notEqual(rows[0].image_path,oldPath);assert.equal(rows[1].image_path,null);assert.deepEqual(deleted,[oldPath]);
  await popup.getByLabel('Choose popup image').setInputFiles(file);
  await popup.getByAltText('Welcome popup image preview').waitFor();
  failUpload=true;
  await popup.getByRole('button',{name:'Save popup image'}).click();
  await popup.getByText(/Upload failed/).waitFor();assert.equal(rows[1].image_path,null);
  failUpload=false;failSave=true;
  await popup.getByRole('button',{name:'Save popup image'}).click();
  await popup.getByText(/Could not confirm the save/).waitFor();assert.equal(rows[1].image_path,null);assert.deepEqual(deleted,[oldPath]);
  failSave=false;
  await popup.getByRole('button',{name:'Save popup image'}).click();
  await popup.getByText(/Welcome popup image saved/).waitFor();
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await mkdir('.test-results',{recursive:true});await panel.screenshot({path:'.test-results/website-images-mobile.png'});
  await page.goto('http://127.0.0.1:5182/');
  await page.getByRole('dialog',{name:"Today's deal"}).waitFor();
  assert.ok((await page.locator('.hero-img').getAttribute('src')).endsWith(rows[0].image_path));
  assert.ok((await page.locator('.advert-popup img').getAttribute('src')).endsWith(rows[1].image_path));
  await page.getByRole('button',{name:'Close deal'}).click();await page.reload();
  await page.waitForTimeout(1300);assert.equal(await page.getByRole('dialog').count(),0);
  failRead=true;await page.reload();
  assert.equal(await page.locator('.hero-img').getAttribute('src'),'/images/kfc hero section image.png');
  assert.deepEqual(errors,[]);
  console.log('PASS: resize/preview, upload and save failures, independent image saves, old-file cleanup, mobile layout, customer images, popup dismissal and offline defaults');
}finally{await browser.close();}
