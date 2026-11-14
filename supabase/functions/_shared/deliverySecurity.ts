import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { approximateDeliveryDistance, deliveryDistance, straightLineDistance } from './delivery.js';
import { jsonResponse } from './cors.ts';

export class DeliverySecurityError extends Error {
  constructor(message: string, public status: number, public code: string, public retryAfter?: number) { super(message); }
}

export function deliverySecurityResponse(request: Request, error: DeliverySecurityError) {
  const response = jsonResponse(request, { error: error.message, code: error.code,
    ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, error.status);
  if (error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
  return response;
}

function normalizeIp(value: string | null): string | null {
  const ip = value?.trim();
  if (!ip || ip.length > 64) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(part => Number(part) <= 255)) return ip.split('.').map(Number).join('.');
  if (/^[a-f\d:]+$/i.test(ip) && ip.includes(':')) {
    try { return new URL(`http://[${ip}]/`).hostname.toLowerCase(); } catch { return null; }
  }
  return null;
}

export async function deliveryClientHash(request: Request) {
  // Gateway headers are a best-effort client key, never authorization.
  // Aggregate limits and routing budgets cannot be bypassed by spoofing them.
  const ip = normalizeIp(request.headers.get('cf-connecting-ip'))
    || normalizeIp(request.headers.get('x-real-ip'))
    || normalizeIp(request.headers.get('x-forwarded-for')?.split(',')[0] ?? null) || 'unknown';
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new DeliverySecurityError('Delivery is temporarily unavailable. Please try again shortly.', 503, 'DELIVERY_UNAVAILABLE');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('delivery-rate:' + ip));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function limitDeliveryRequest(db: SupabaseClient, request: Request) {
  const { data, error } = await db.rpc('check_delivery_request', { p_client_hash: await deliveryClientHash(request) });
  if (error || typeof data?.allowed !== 'boolean') throw new DeliverySecurityError('Delivery is temporarily unavailable. Please try again shortly.', 503, 'DELIVERY_UNAVAILABLE');
  if (!data.allowed) throw new DeliverySecurityError('Too many delivery checks. Please wait before trying again.', 429, 'RATE_LIMITED', Math.max(1, Number(data.retryAfter) || 60));
}

export async function protectedDeliveryDistance(db: SupabaseClient, destination: { lat: number; lng: number }, savedRadius?: unknown) {
  let radius = savedRadius;
  if (radius === undefined) {
    const { data, error } = await db.from('restaurant_settings').select('delivery_radius_km').eq('id', true).single();
    if (error) throw new DeliverySecurityError('Delivery settings are unavailable. Please try again shortly.', 503, 'DELIVERY_UNAVAILABLE');
    radius = data?.delivery_radius_km;
  }
  if (radius == null || !Number.isFinite(Number(radius)) || Number(radius) < 0.5 || Number(radius) > 100) {
    throw new DeliverySecurityError('Delivery settings are unavailable. Please try again shortly.', 503, 'DELIVERY_UNAVAILABLE');
  }
  const origin = { lat: Number(Deno.env.get('RESTAURANT_LAT') || NaN), lng: Number(Deno.env.get('RESTAURANT_LNG') || NaN) };
  const distance = straightLineDistance(origin, destination);
  if (distance > Number(radius)) throw new DeliverySecurityError(`This location is outside our ${Number(radius)} km delivery area. Please choose a closer location.`, 422, 'OUTSIDE_SERVICE_AREA');
  const apiKey = (Deno.env.get('OPENROUTESERVICE_API_KEY') || '').trim();
  if (!apiKey) throw new DeliverySecurityError('Delivery routing is not configured. Please contact the restaurant.', 503, 'DELIVERY_UNAVAILABLE');
  // Reserve budget only after the service-area check, for both public endpoints.
  const { data: allowed, error } = await db.rpc('reserve_delivery_route');
  if (error || typeof allowed !== 'boolean') throw new DeliverySecurityError('Delivery is temporarily unavailable. Please try again shortly.', 503, 'DELIVERY_UNAVAILABLE');
  return allowed ? deliveryDistance(origin, destination, { apiKey }) : approximateDeliveryDistance(origin, destination);
}
