// Installation lifecycle is simulated; no real installs, notifications or backend writes.
import { chromium } from '../.test-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
await context.routeWebSocket('**/*',ws=>ws.close());
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  const path=url.pathname;
  if(path.includes('/rest/v1/'))return route.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('/restaurant_settings')?{minimum_order_amount:0,restaurant_phone:'03000000000'}:[])});
  return route.abort();
});
await context.addInitScript(()=>{sessionStorage.setItem('kech-ad-seen','true');window.promptCalls=0;window.permissionCalls=0;if('Notification' in window)Notification.requestPermission=()=>{window.permissionCalls++;return Promise.resolve('default');};});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const event=async outcome=>page.evaluate(outcome=>{
  const e=new Event('beforeinstallprompt',{cancelable:true});
  e.prompt=async()=>{window.promptCalls++;if(outcome==='error')throw Error('test failure');};
  e.userChoice=Promise.resolve({outcome});window.dispatchEvent(e);return e.defaultPrevented;
},outcome);
const ready=()=>page.getByRole('heading',{name:/Your favourites/}).waitFor();
try{
  await page.goto('http://127.0.0.1:5182/');
  await page.locator('.bottom-nav a[href="/get-app"]').waitFor();
  assert.equal(await event('dismissed'),true);
  await page.locator('.bottom-nav a[href="/get-app"]').click();await ready();
  await page.getByRole('button',{name:'Install app',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.promptCalls),0,'No automatic install prompt');
  await page.getByRole('button',{name:'Install app',exact:true}).click();
  await page.getByText('No problem. You can install later using the steps below.').waitFor();
  await page.getByRole('link',{name:/See install steps/}).waitFor();
  await page.getByRole('button',{name:'iPhone / iPad',exact:true}).click();
  await page.getByText('Open as Web App',{exact:true}).waitFor();
  for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
  }
  await page.setViewportSize({width:390,height:844});
  await mkdir('.test-results',{recursive:true});await page.screenshot({path:'.test-results/get-app-mobile.png',fullPage:true});
  await event('error');await page.getByRole('button',{name:'Install app',exact:true}).click();
  await page.getByText(/Your browser could not open the install prompt/).waitFor();
  await event('accepted');await page.getByRole('button',{name:'Install app',exact:true}).click();
  await page.getByText(/Installation requested/).waitFor();
  assert.equal(await page.getByText('You’re all set!',{exact:true}).count(),0,'Acceptance is not confirmed installation');
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  await page.getByText('You’re all set!',{exact:true}).waitFor();
  assert.equal(await page.locator('a[href="/get-app"]').count(),0);
  assert.equal(await page.locator('#install-instructions').count(),0);
  assert.equal(await page.evaluate(()=>window.permissionCalls),0);
  await page.goto('http://127.0.0.1:5182/rider');
  await page.getByRole('heading',{name:'KFC Turbat Rider'}).waitFor();
  assert.equal(await event('accepted'),false,'Customer listener must not take rider prompts');
  await page.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=q=>{const result=original(q);if(q==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};});
  await page.goto('http://127.0.0.1:5182/get-app');await page.getByText('You’re all set!',{exact:true}).waitFor();
  assert.equal(await page.locator('a[href="/get-app"]').count(),0);
  assert.equal(await page.locator('#app-manifest').getAttribute('href'),'/customer.webmanifest');
  assert.deepEqual(errors,[]);
  console.log('PASS: prompt retained across navigation, click-only install, dismiss/error/accepted/installed states, standalone detection, mobile layout, no permission prompts and rider isolation');
}finally{await browser.close();}
