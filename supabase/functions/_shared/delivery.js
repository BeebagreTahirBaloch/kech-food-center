// Single source for browser estimates and server/Telegram suggestions.
export const deliveryTiers = [
  { maxKm: 5, charge: 100, label: '0–5 km' },
  { maxKm: 8, charge: 150, label: 'Over 5–8 km' },
  { maxKm: Infinity, charge: 300, label: 'Over 8 km' },
];
export function suggestedCharge(km) {
  if (!Number.isFinite(km) || km < 0) throw new Error('Invalid delivery distance');
  return deliveryTiers.find(tier => km <= tier.maxKm).charge;
}
export class DeliveryRoutingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function straightLineDistance(origin, destination) {
  for (const point of [origin, destination]) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat)>90 || Math.abs(point.lng)>180) throw new DeliveryRoutingError('Restaurant or delivery coordinates are not configured.', 503);
  }
  const rad = degrees => degrees * Math.PI / 180;
  const a = Math.sin(rad(destination.lat-origin.lat)/2)**2 + Math.cos(rad(origin.lat))*Math.cos(rad(destination.lat))*Math.sin(rad(destination.lng-origin.lng)/2)**2;
  return 2*6371*Math.asin(Math.sqrt(Math.min(1,a)));
}
export function approximateDeliveryDistance(origin, destination) {
  return { distanceKm: Math.round(straightLineDistance(origin, destination)*1.3*10)/10, distanceMethod: 'haversine' };
}
// The API key is supplied only by the Edge Function wrapper in orders.ts.
// This module is also imported for legacy tier labels by the customer site.
export async function deliveryDistance(origin, destination, { apiKey = '' } = {}) {
  for (const point of [origin, destination]) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat)>90 || Math.abs(point.lng)>180) throw new Error('Restaurant or delivery coordinates are not configured.');
  }
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const configurationError = 'Delivery routing is not configured. Please contact the restaurant.';
  if (!key) throw new DeliveryRoutingError(configurationError, 503);
  let response;
  try {
    response = await fetch('https://api.heigit.org/openrouteservice/v2/directions/driving-car/json', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]],
        preference: 'fastest', units: 'm', instructions: false, geometry: false,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* Network failure/timeout: keep the existing approximate fallback. */ }
  if (response) {
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new DeliveryRoutingError(configurationError, 503);
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
      await response.body?.cancel();
      throw new DeliveryRoutingError('No driving route could be calculated. Please check your delivery pin.');
    }
    if (response.ok) try {
      const data = await response.json();
      const meters = data.routes?.[0]?.summary?.distance;
      if (typeof meters === 'number' && Number.isFinite(meters) && meters >= 0) {
        return { distanceKm: Math.round(meters / 100) / 10, distanceMethod: 'openrouteservice' };
      }
    } catch { /* Invalid provider response: do not expose its body or credentials. */ }
    else await response.body?.cancel();
  }
  // No retries on quota errors. The returned method makes fallback visible at checkout.
  return approximateDeliveryDistance(origin, destination);
}
export async function roadDistance(origin, destination, options = {}) {
  return (await deliveryDistance(origin, destination, options)).distanceKm;
}
