import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, rejectOrigin, jsonResponse } from '../_shared/cors.ts';
import { parseDeliveryLocation, calculateDeliveryDistance } from '../_shared/orders.ts';
import { DeliveryRoutingError } from '../_shared/delivery.js';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  const denied = rejectOrigin(request); if (denied) return denied;
  if (request.method !== 'POST') return jsonResponse(request, {error:'Method not allowed'},405);
  try {
    const body = await request.json();
    const location = await parseDeliveryLocation(body.deliveryLocation);
    const {distanceKm,distanceMethod} = await calculateDeliveryDistance(location);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:deliveryCharge,error}=await db.rpc('delivery_charge_for_distance',{km:distanceKm});
    if(error || !Number.isInteger(deliveryCharge))throw Error('Delivery rate unavailable');
    return jsonResponse(request,{distanceKm,distanceMethod,deliveryCharge});
  } catch (error) {
    if(error instanceof DeliveryRoutingError)return jsonResponse(request,{error:error.message},error.status);
    return jsonResponse(request,{error:'Unable to calculate delivery. Check your pin or Google Maps link and try again.'},400);
  }
});
