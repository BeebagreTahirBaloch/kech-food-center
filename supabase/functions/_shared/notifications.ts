import {serviceClient} from './access.ts';
import {sendPush} from './push.ts';
import {notificationPayload,shouldSendNotification} from './notificationPayload.js';
export async function dispatchNotificationJobs(){
 const db=serviceClient();const {data:jobs,error}=await db.rpc('claim_notification_jobs');if(error)throw Error('Notification queue unavailable');
 for(const job of jobs || [])try{
  const {data:order,error}=await db.from('orders').select('id,status,rider_id,progress_at').eq('id',job.order_id).maybeSingle();if(error)throw error;
  if(shouldSendNotification(job,order)){
   const table=job.audience==='customer'?'customer_push_subscriptions':'push_subscriptions';
   let subscriptions;
   if(job.audience==='customer'){
    const result=await db.from(table).select('*').eq('order_id',job.order_id).gt('expires_at',new Date().toISOString());if(result.error)throw result.error;subscriptions=result.data;
   }else{
    const result=await db.from('admins').select('user_id');if(result.error)throw result.error;
    const ids=(result.data || []).map(x=>x.user_id);
    if(ids.length){const result=await db.from(table).select('*').in('user_id',ids);if(result.error)throw result.error;subscriptions=result.data;}
   }
   const results=await Promise.allSettled((subscriptions || []).map(sub=>sendPush(sub,notificationPayload(job,order),table)));
   if(results.some(x=>x.status==='rejected'))throw Error('Notification retry needed');
  }
  const result=await db.from('notification_jobs').update({finished_at:new Date().toISOString()}).eq('id',job.id);if(result.error)throw result.error;
 }catch{ /* Lease retries; never log customer data, endpoints or subscription keys. */ }
}
