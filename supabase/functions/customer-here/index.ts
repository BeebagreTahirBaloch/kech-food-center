import {serviceClient} from '../_shared/access.ts';
import {isUuid} from '../_shared/orders.ts';
import {preflight,rejectOrigin,jsonResponse} from '../_shared/cors.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return preflight(request);
 const denied=rejectOrigin(request);if(denied)return denied;
 if(request.method!=='POST')return jsonResponse(request,{error:'Method not allowed'},405);
 try{
  const {orderId}=await request.json();if(!isUuid(orderId))return jsonResponse(request,{error:'Invalid order ID'},400);
  const db=serviceClient();
  const {data,error}=await db.rpc('customer_here',{order_id:orderId});
  if(error)throw error;
  if(data!=='updated') {
   const {data:existing,error:lookupError}=await db.from('orders').select('id').eq('id',orderId).maybeSingle();
   if(lookupError)return jsonResponse(request,{error:'Unable to check this order. Please try again.'},503);
   if(!existing)return jsonResponse(request,{error:'Order not found.'},404);
  }
  return jsonResponse(request,data==='updated'?{ok:true}:{error:data},data==='updated'?200:409);
 }catch{return jsonResponse(request,{error:'Unable to record your response'},400);}
});
