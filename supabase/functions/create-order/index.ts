import {fingerprint,phoneHash,readOrderBody} from '../_shared/orderProtection.ts';
import { dispatchPushJobs } from '../_shared/push.ts';
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflight, rejectOrigin } from "../_shared/cors.ts";
import { calculateRoadDistanceKm, parseDeliveryLocation, validateCart, validateCustomer, isUuid } from "../_shared/orders.ts";
import { isTelegramEnabled, orderKeyboard, riderChatId, riderOrderMessage, telegram } from "../_shared/telegram.ts";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  const originError = rejectOrigin(request);
  if (originError) return originError;
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed." }, 405);

  const supabase = serviceClient();
  let requestKey:string|null=null,leaseId:string|null=null;
  let savedOrder:{orderId:string,createdAt:string,subtotal:number}|null=null;
  let insertStarted=false;
  try {
    const body = await readOrderBody(request);
    const customer = validateCustomer(body?.customer);
    const cart=validateCart(body?.items);
    if(!isUuid(body?.requestId))return jsonResponse(request,{error:'Refresh the checkout page before sending your order.',code:'REQUEST_ID_REQUIRED'},400);
    if(!Number.isSafeInteger(body.deliveryCharge)||body.deliveryCharge<0)throw Error('Calculate your delivery charge first.');
    requestKey=body.requestId;
    const hash=await fingerprint({customer,deliveryLocation:body.deliveryLocation,items:cart,deliveryCharge:body.deliveryCharge,...(body.reviewedSubtotal!=null?{reviewedSubtotal:body.reviewedSubtotal}:{})});
    const {data:guard,error:guardError}=await supabase.rpc('begin_order_request',{p_key:requestKey,p_fingerprint:hash,p_phone_hash:await phoneHash(customer.phone,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)});
    if(guardError||!guard)return jsonResponse(request,{error:'Ordering is temporarily unavailable. Please try again shortly.'},503);
    if(guard.status==='replay')return jsonResponse(request,{orderId:guard.orderId,createdAt:guard.createdAt,subtotal:guard.subtotal,replayed:true});
    if(guard.status==='rate_limited'||guard.status==='in_progress'){
      const response=jsonResponse(request,{error:guard.status==='rate_limited'?'Too many order attempts. Please wait before trying again.':'Your order is still being processed. Wait a few seconds, then retry.',code:guard.status==='rate_limited'?'RATE_LIMITED':'ORDER_IN_PROGRESS',retryAfter:guard.retryAfter},guard.status==='rate_limited'?429:409);
      response.headers.set('Retry-After',String(guard.retryAfter));return response;
    }
    if(guard.status==='conflict')return jsonResponse(request,{error:'This checkout reference belongs to a different order. Check your orders before starting again.',code:'REQUEST_CONFLICT'},409);
    if(guard.status!=='accepted')return jsonResponse(request,{error:'Unable to start this order. Please retry.'},503);
    leaseId=guard.leaseId;
    const location = await parseDeliveryLocation(body?.deliveryLocation);
    const { data: priced, error: pricingError } = await supabase.rpc('price_menu_cart', { p_lines: cart });
    if (pricingError) throw new Error(pricingError.message);
    const items = priced as { productId: string; name: string; optionLabel: string; unitPrice: number; quantity: number; lineTotal: number }[];
    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal > 2_000_000) throw new Error("Order total is too high. Please review your cart.");
    if(body.reviewedSubtotal!=null && (!Number.isSafeInteger(body.reviewedSubtotal)||body.reviewedSubtotal!==subtotal))return jsonResponse(request,{error:'Menu prices changed. Review your refreshed cart total and send the order again.',code:'MENU_PRICE_CHANGED'},409);
    const distanceKm = await calculateRoadDistanceKm(location);
    const {data:deliveryCharge,error:rateError}=await supabase.rpc('delivery_charge_for_distance',{km:distanceKm});
    if(rateError || !Number.isInteger(deliveryCharge))throw new Error('Delivery rates are unavailable. Please try again.');
    if(body.deliveryCharge !== deliveryCharge)return jsonResponse(request,{error:'Delivery charge changed. Refresh your delivery charge and review the total before sending.',code:'DELIVERY_RATE_CHANGED'},409);

    insertStarted=true;
    const { data: order, error: insertError } = await supabase
      .from("orders")
      .insert({
        checkout_request_id: requestKey,
        customer_name: customer.name,
        phone: customer.phone,
        address: customer.address,
        lat: location.lat,
        lng: location.lng,
        items,
        subtotal,
        distance_km: distanceKm,
        estimated_delivery_charge: deliveryCharge,
        delivery_rate_locked: true,
        delivery_charge: deliveryCharge,
        total: subtotal + deliveryCharge,
        status: "pending",
        eta_minutes: null,
        telegram_error: null,
      })
      .select("id, created_at")
      .single();

    if (insertError || !order) {
      if(insertError?.code==='23505'){
        const {data:existing}=await supabase.from('orders').select('id,created_at,subtotal').eq('checkout_request_id',requestKey).maybeSingle();
        if(existing)return jsonResponse(request,{orderId:existing.id,createdAt:existing.created_at,subtotal:existing.subtotal,replayed:true});
      }
      if(insertError?.code==='P0002')return jsonResponse(request,{error:'Delivery rates changed. Refresh the delivery charge before ordering.',code:'DELIVERY_RATE_CHANGED'},409);
      if(insertError?.code==='P0001')return jsonResponse(request,{error:'Ordering is currently closed. Please try again when ordering resumes.'},409);
      console.error("Order insert failed");
      return jsonResponse(request, { error: "We couldn't save your order. Please try again." }, 500);
    }

    savedOrder={orderId:order.id,createdAt:order.created_at,subtotal};
    const riderMessage = riderOrderMessage({
      id: order.id, customer_name: customer.name, phone: customer.phone, address: customer.address,
      items, subtotal, delivery_charge:deliveryCharge,total:subtotal+deliveryCharge,distance_km: distanceKm.toFixed(1),
    }, 'NEW KECH FOOD CENTER ORDER');
    const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
    let telegramError: string | null = null;
    let messageId: number | null = null;
    let chatId: string | null = null;

    if (isTelegramEnabled()) try {
      chatId = riderChatId();
      const sentMessage = await telegram("sendMessage", {
        chat_id: chatId,
        text: riderMessage,
        parse_mode: "HTML",
        reply_markup: orderKeyboard(order.id, navigateUrl),
        disable_web_page_preview: true,
      });
      messageId = sentMessage.message_id;
      await telegram("sendLocation", {
        chat_id: chatId,
        latitude: location.lat,
        longitude: location.lng,
        reply_to_message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: "Navigate", url: navigateUrl }]] },
      });
    } catch (error) {
      telegramError = "Telegram notification failed. Check server configuration.";
      console.error("Telegram order notification failed");
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ telegram_error: telegramError, telegram_message_id: messageId, telegram_chat_id: chatId })
      .eq("id", order.id);
    if (updateError) console.error("Order notification metadata update failed");

    const pushTask=dispatchPushJobs().catch(()=>{});
    const runtime=(globalThis as typeof globalThis & {EdgeRuntime?:{waitUntil:(task:Promise<unknown>)=>void}}).EdgeRuntime;
    if(runtime?.waitUntil)runtime.waitUntil(pushTask);else await pushTask;
    return jsonResponse(request, { orderId: order.id, createdAt: order.created_at, subtotal });
  } catch (error) {
    if(savedOrder)return jsonResponse(request,savedOrder);
    if(insertStarted)return jsonResponse(request,{error:'We could not confirm the result. Please retry this same checkout; it will not create a duplicate.'},503);
    const message = error instanceof Error ? error.message : "Unable to place this order.";
    return jsonResponse(request, { error: message }, 400);
  } finally {
    if(requestKey&&leaseId)await supabase.rpc('release_order_request',{p_key:requestKey,p_lease:leaseId}).then(()=>{},()=>{});
  }
});
