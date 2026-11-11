import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, rejectOrigin, jsonResponse } from '../_shared/cors.ts';
import { parseDeliveryLocation } from '../_shared/orders.ts';
import { DeliveryRoutingError } from '../_shared/delivery.js';
import { readOrderBody } from '../_shared/orderProtection.ts';
import { DeliverySecurityError, deliverySecurityResponse, limitDeliveryRequest, protectedDeliveryDistance } from '../_shared/deliverySecurity.ts';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  const denied = rejectOrigin(request); if (denied) return denied;
  if (request.method !== 'POST') return jsonResponse(request, {error:'Method not allowed'},405);
  try {
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await limitDeliveryRequest(db, request);
    const body = await readOrderBody(request);
    const location = await parseDeliveryLocation(body.deliveryLocation);
    const {distanceKm,distanceMethod} = await protectedDeliveryDistance(db, location);
    const {data:deliveryCharge,error}=await db.rpc('delivery_charge_for_distance',{km:distanceKm});
    if(error || !Number.isInteger(deliveryCharge))throw Error('Delivery rate unavailable');
    return jsonResponse(request,{distanceKm,distanceMethod,deliveryCharge});
  } catch (error) {
    if(error instanceof DeliverySecurityError)return deliverySecurityResponse(request,error);
    if(error instanceof DeliveryRoutingError)return jsonResponse(request,{error:error.message},error.status);
    return jsonResponse(request,{error:'Unable to calculate delivery. Check your pin or Google Maps link and try again.'},400);
  }
});
