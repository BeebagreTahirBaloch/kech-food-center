// No caching of API responses, customer data or authenticated pages.
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('push',event=>{
 let data={};try{data=event.data.json();}catch{}
 event.waitUntil(self.registration.showNotification(data.title || 'KFC Turbat Rider',{
  body:data.body || 'Open the app to check orders.',icon:'/rider-icon-192.png',badge:'/rider-icon-192.png',tag:data.tag || 'rider-orders',renotify:true,data:{url:'/rider?tab=new'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(c=>new URL(c.url).origin===self.location.origin && new URL(c.url).pathname.startsWith('/rider'));
  if(client){await client.navigate('/rider?tab=new');return client.focus();}
  return self.clients.openWindow('/rider?tab=new');
 })());
});

self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('You are offline. Reconnect and reopen KFC Turbat Rider.',{headers:{'Content-Type':'text/plain; charset=utf-8'}})));
});
