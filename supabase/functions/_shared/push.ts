// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import {serviceClient} from './access.ts';
import {isTelegramEnabled,telegram,riderChatId,orderKeyboard,riderOrderMessage} from './telegram.ts';
import {dispatchNotificationJobs} from './notifications.ts';
export function validPushEndpoint(endpoint:string){
 try {const u=new URL(endpoint);return u.protocol==='https:' && !u.username && !u.password && !u.port && (u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com' || u.hostname.endsWith('.push.apple.com') || u.hostname.endsWith('.notify.windows.com'));}catch{return false;}
}
export async function sendPush(subscription:Record<string,string>,payload:Record<string,unknown>,table:'push_subscriptions'|'customer_push_subscriptions'='push_subscriptions'){
 if(!validPushEndpoint(subscription.endpoint))throw Error('Unsupported push endpoint');
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
 if(!publicKey || !privateKey || !subject)throw Error('Push is not configured');
 const request=webpush.generateRequestDetails({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{TTL:120,urgency:'high',vapidDetails:{subject,publicKey,privateKey}});
 const response=await fetch(subscription.endpoint,{method:'POST',headers:request.headers as Record<string,string>,body:request.body as unknown as BodyInit,redirect:'error',signal:AbortSignal.timeout(8000)});
 await response.body?.cancel();
 if(response.status===404 || response.status===410){await serviceClient().from(table).delete().eq('id',subscription.id);return;}
 if(!response.ok)throw Error('Push delivery failed');
}
export async function dispatchPushJobs(){
 await dispatchNotificationJobs().catch(()=>{});
 const db=serviceClient();
 const {data:jobs,error}=await db.rpc('claim_push_jobs');if(error)throw error;
 for(const job of jobs || []){
  try{
   const {data:o,error:lookup}=await db.from('orders').select('*').eq('id',job.order_id).maybeSingle();if(lookup)throw lookup;
   let deliveryFailed=false;
   if(o?.status==='pending' && o.rider_id==null){
    const {data:riders,error:riderError}=await db.from('riders').select('user_id').eq('active',true).eq('online',true);if(riderError)throw riderError;
    const ids=(riders || []).map(r=>r.user_id);
    if(ids.length){
     const {data:subscriptions,error:subError}=await db.from('push_subscriptions').select('*').in('user_id',ids);if(subError)throw subError;
     const results=await Promise.allSettled((subscriptions || []).map(sub=>sendPush(sub,{title:job.kind==='reminder'?'Order still waiting':'New delivery order',body:'Open the rider app to view available orders.',tag:'order-'+o.id,renotify:true,url:'/rider?tab=new'})));
     deliveryFailed=results.some(result=>result.status==='rejected');
    }
    if(job.kind==='reminder' && !job.telegram_sent_at && isTelegramEnabled()){
     await telegram('sendMessage',{chat_id:riderChatId(),parse_mode:'HTML',text:riderOrderMessage(o,'Order still waiting for a rider',o.delivery_charge == null ? o.estimated_delivery_charge ?? undefined : undefined),reply_markup:orderKeyboard(o.id,`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`)});
     await db.from('order_push_jobs').update({telegram_sent_at:new Date().toISOString()}).eq('id',job.id);
    }
   }
   if(deliveryFailed)throw Error('Push retry needed');
   await db.from('order_push_jobs').update({finished_at:new Date().toISOString()}).eq('id',job.id);
  }catch{ /* Durable lease retries up to three times; never log endpoints or private details. */ }
 }
}
