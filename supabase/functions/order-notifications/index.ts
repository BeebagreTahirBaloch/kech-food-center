import {caller,serviceClient} from '../_shared/access.ts';
import {preflight,rejectOrigin,jsonResponse} from '../_shared/cors.ts';
import {isUuid} from '../_shared/orders.ts';
import {readOrderBody,fingerprint} from '../_shared/orderProtection.ts';
import {validPushEndpoint,sendPush} from '../_shared/push.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return preflight(request);
 const denied=rejectOrigin(request);if(denied)return denied;
 if(request.method!=='POST')return jsonResponse(request,{error:'Method not allowed'},405);
 try{
  const body=await readOrderBody(request);const db=serviceClient();
  if(body.action==='test-owner'){
   const {user}=await caller(request,'is_admin');const result=await db.from('push_subscriptions').select('*').eq('user_id',user.id);if(result.error)throw result.error;
   if(!result.data?.length)return jsonResponse(request,{error:'Enable owner alerts first'},400);
   for(const sub of result.data)await sendPush(sub,{title:'Kech Food Center owner',body:'Owner alerts are working.',tag:'owner-test',url:'/admin/orders'});
   return jsonResponse(request,{ok:true});
  }
  if(!isUuid(body.orderId)||!isUuid(body.ownerToken)||typeof body.endpoint!=='string'||!validPushEndpoint(body.endpoint)||!['save','remove','status'].includes(body.action))throw Error('Invalid request');
  const result=await db.rpc('customer_push_registration',{p_order:body.orderId,p_endpoint:body.endpoint,p_key:body.p256dh??null,p_auth:body.auth??null,p_owner_hash:await fingerprint(body.ownerToken),p_action:body.action});
  if(result.error)throw Error('Registration failed');
  return jsonResponse(request,{enabled:result.data===true});
 }catch{return jsonResponse(request,{error:'Unable to update alerts. Check the order, permissions and notification setup, then try again.'},400);}
});
