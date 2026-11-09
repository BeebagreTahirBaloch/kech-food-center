import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, rejectOrigin, jsonResponse } from '../_shared/cors.ts';
import { isUuid } from '../_shared/orders.ts';
import { telegram } from '../_shared/telegram.ts';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  const denied=rejectOrigin(request); if(denied)return denied;
  if(request.method!=='POST')return jsonResponse(request,{error:'Method not allowed'},405);
  try {
    const {orderId}=await request.json();
    if(!isUuid(orderId))return jsonResponse(request,{error:'Invalid order ID'},400);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data,error}=await db.from('orders').update({status:'cancelled',cancelled_by:'customer',cancelled_at:new Date().toISOString()}).eq('id',orderId).eq('status','pending').select('id,telegram_message_id,telegram_chat_id').maybeSingle();
    if(error) {
      // Return only a safe diagnostic code; database details can contain private data.
      if(error.code==='23514')return jsonResponse(request,{error:'Cancellation was blocked by a database rule. Ask the owner to run migration 202611010007_pending_order_cancellation.sql.',code:'CANCEL_CONSTRAINT'},500);
      if(error.code==='42703' || error.code==='PGRST204')return jsonResponse(request,{error:'The cancellation database setup is incomplete. Ask the owner to apply the rider operations migration.',code:'CANCEL_SCHEMA'},500);
      return jsonResponse(request,{error:'The database could not save the cancellation. Please contact the restaurant.',code:'CANCEL_DATABASE'},500);
    }
    if(!data)return jsonResponse(request,{error:'The rider already accepted or this order is no longer pending.'},409);
    if(data.telegram_chat_id && data.telegram_message_id) {
      try { await telegram('editMessageText',{chat_id:data.telegram_chat_id,message_id:data.telegram_message_id,text:`Order ${data.id} cancelled by customer.`,reply_markup:{inline_keyboard:[]}}); } catch { /* Cancellation is saved even if Telegram is unavailable. */ }
    }
    return jsonResponse(request,{cancelled:true});
  } catch { return jsonResponse(request,{error:'Unable to cancel the order.'},400); }
});
