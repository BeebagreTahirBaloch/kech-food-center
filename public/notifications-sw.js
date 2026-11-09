// Shared owner/customer push worker. No API, HTML or customer-data caching.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data.json();}catch{}
 const path=typeof data.url==='string'&&(/^\/track\/[a-f0-9-]{36}$/i.test(data.url)||/^\/admin(?:\/|$)/.test(data.url))?data.url:'/orders';
 event.waitUntil(self.registration.showNotification(data.title||'Kech Food Center',{
  body:data.body||'Open the app for an update.',icon:'/rider-icon-192.png',badge:'/rider-icon-192.png',tag:data.tag||'order-update',renotify:true,data:{url:path}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const url=new URL(event.notification.data?.url||'/orders',self.location.origin);
  if(url.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(c=>c.url===url.href);if(client)return client.focus();
  return self.clients.openWindow(url.href);
 })());
});
