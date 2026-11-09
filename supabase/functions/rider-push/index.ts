import {caller,serviceClient} from '../_shared/access.ts';
import {sendPush,dispatchPushJobs} from '../_shared/push.ts';
import {preflight,rejectOrigin,jsonResponse} from '../_shared/cors.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return preflight(request);
 const denied=rejectOrigin(request);if(denied)return denied;
 if(request.method!=='POST')return jsonResponse(request,{error:'Method not allowed'},405);
 const secret=Deno.env.get('PUSH_CRON_SECRET');
 if(secret && request.headers.get('x-cron-secret')===secret){await dispatchPushJobs();return jsonResponse(request,{ok:true});}
 try{
  const {user}=await caller(request,'is_rider');
  const {data,error}=await serviceClient().from('push_subscriptions').select('*').eq('user_id',user.id);if(error)throw error;
  if(!data?.length)return jsonResponse(request,{error:'Turn on order alerts first'},400);
  for(const sub of data)await sendPush(sub,{title:'KFC Turbat Rider',body:'Test alert: your order alerts are working.',tag:'rider-test',renotify:true,url:'/rider'});
  return jsonResponse(request,{ok:true});
 }catch{return jsonResponse(request,{error:'Unable to send test alert. Check your rider login and push setup.'},400);}
});
