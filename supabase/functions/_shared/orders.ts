import { deliveryDistance } from './delivery.js';
export { suggestedCharge } from './delivery.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateCustomer(value: unknown) {
  const customer = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const name = typeof customer.name === "string" ? customer.name.trim() : "";
  const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";
  const address = typeof customer.address === "string" ? customer.address.trim() : "";
  const phoneDigits = phone.replace(/\D/g, "");
  if (name.length < 2 || name.length > 80) throw new Error("Enter your name (2 to 80 characters).");
  if (phone.length > 20 || phoneDigits.length < 7 || phoneDigits.length > 15) throw new Error("Enter a valid phone number.");
  if (address.length < 5 || address.length > 250) throw new Error("Enter your full delivery address (5 to 250 characters).");
  return { name, phone, address };
}

export function validateCart(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("Add between 1 and 50 menu items to your order.");
  }

  return value.map((line) => {
    const requestItem = line && typeof line === "object" ? line as Record<string, unknown> : {};
    const quantity = Number(requestItem.quantity);
    if (!isUuid(requestItem.itemId) || (requestItem.sizeId !== null && !isUuid(requestItem.sizeId))) throw new Error("Refresh your cart and select valid menu items.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Each item quantity must be between 1 and 99.");

    return {
      itemId: requestItem.itemId,
      sizeId: requestItem.sizeId,
      quantity,
    };
  });
}

export function publicOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    arrivalEtaAt:row.arrival_eta_at,delayReason:row.delay_reason,
    acceptedAt: row.accepted_at, releasedAt: row.released_at,
    arrivedAt: row.arrived_at, customerHereAt: row.customer_here_at, customerHereUsed: row.customer_here_used,
    cancelledAt: row.cancelled_at, cancelledBy: row.cancelled_by, cancelReason: row.cancel_reason,
    items: row.items,
    lat: row.lat,
    lng: row.lng,
    subtotal: row.subtotal,
    distanceKm: row.distance_km,
    estimatedDeliveryCharge: row.estimated_delivery_charge,
    deliveryCharge: row.delivery_charge,
    total: row.total,
    status: row.status,
    etaMinutes: row.eta_minutes,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    outForDeliveryAt: row.out_for_delivery_at,
    deliveredAt: row.delivered_at,
  };
}

export async function parseDeliveryLocation(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Choose a delivery pin or paste a Google Maps link.");
  const location = value as Record<string, unknown>;
  const lat = typeof location.lat === "number" || (typeof location.lat === "string" && location.lat.trim()) ? Number(location.lat) : NaN;
  const lng = typeof location.lng === "number" || (typeof location.lng === "string" && location.lng.trim()) ? Number(location.lng) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return validateCoordinates(lat, lng);
  }
  if (typeof location.googleMapsUrl !== "string" || !location.googleMapsUrl.trim()) {
    throw new Error("Choose a delivery pin or paste a Google Maps link.");
  }
  return parseGoogleMapsUrl(location.googleMapsUrl.trim());
}

function validateCoordinates(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("The delivery coordinates are invalid. Please drop a pin on the map.");
  }
  return { lat, lng };
}

function coordinatePair(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function parseGoogleMapsUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("That Google Maps link is invalid. Please paste a full link or drop a pin."); }
  if (url.protocol !== "https:") throw new Error("Please paste a secure Google Maps link or drop a pin on the map.");
  if(url.username || url.password || url.port)throw new Error("Please use a standard Google Maps link or drop a pin.");
  const host = url.hostname.toLowerCase();
  const isShortLink = host === "maps.app.goo.gl" || host === "goo.gl";
  const isGoogleMaps = host === "google.com" || host.endsWith(".google.com");
  if (!isShortLink && !isGoogleMaps) throw new Error("Please paste a Google Maps link or drop a pin on the map.");

  let resolvedUrl = url;
  if (isShortLink) {
    try {
      let nextUrl = url;
      for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
        const response = await fetch(nextUrl.toString(), { redirect: "manual", signal: AbortSignal.timeout(6000) });
        const redirectTo = response.headers.get("location");
        if (!redirectTo) {
          resolvedUrl = new URL(response.url || nextUrl.toString());
          await response.body?.cancel();
          break;
        }
        await response.body?.cancel();
        nextUrl = new URL(redirectTo, nextUrl);
        if(nextUrl.protocol!=="https:" || nextUrl.username || nextUrl.password || nextUrl.port)throw new Error("Unsafe Maps redirect");
        const nextHost = nextUrl.hostname.toLowerCase();
        if (nextHost !== "maps.app.goo.gl" && nextHost !== "goo.gl" && nextHost !== "google.com" && !nextHost.endsWith(".google.com")) {
          throw new Error("That short link did not redirect to Google Maps.");
        }
        if (redirectCount === 5) throw new Error("That Google Maps short link has too many redirects.");
      }
    } catch {
      throw new Error("We couldn't open that short Google Maps link. Please drop a pin on the map instead.");
    }
    const resolvedHost = resolvedUrl.hostname.toLowerCase();
    if (resolvedHost !== "google.com" && !resolvedHost.endsWith(".google.com")) {
      throw new Error("That short link did not open a Google Maps location. Please drop a pin on the map.");
    }
  }

  const missing = "We couldn't identify the delivery destination in that link. Please share a location pin or drop a pin on the map.";
  // Explicit directions destinations must never fall back to an origin or camera.
  for (const key of ["destination", "daddr"]) {
    if(resolvedUrl.searchParams.has(key)) {
      const pair=coordinatePair(resolvedUrl.searchParams.get(key));
      if(pair)return pair;
      throw new Error(missing);
    }
  }
  const decoded=decodeURIComponent(`${resolvedUrl.pathname}${resolvedUrl.search}`);
  const places=[...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)(?=!|&|$)/g)];
  // Embedded route data may contain origins and stops: never guess a destination.
  if(/\/maps\/dir(?:\/|$)/.test(resolvedUrl.pathname))throw new Error(missing);
  if(places.length===1)return validateCoordinates(Number(places[0][1]),Number(places[0][2]));
  if(places.length>1)throw new Error(missing);
  for(const key of ["query","q"]) {
    if(resolvedUrl.searchParams.has(key)) {
      const pair=coordinatePair(resolvedUrl.searchParams.get(key));
      if(pair)return pair;
      throw new Error(missing);
    }
  }
  // @lat,lng, ll and center may be a camera position rather than the selected pin.
  throw new Error(missing);
}

export async function calculateRoadDistanceKm(destination: { lat: number; lng: number }) {
  return (await calculateDeliveryDistance(destination)).distanceKm;
}

export async function calculateDeliveryDistance(destination: { lat: number; lng: number }) {
  return deliveryDistance(
    {lat: Number(Deno.env.get('RESTAURANT_LAT') || NaN), lng: Number(Deno.env.get('RESTAURANT_LNG') || NaN)},
    destination,
    {apiKey: Deno.env.get('OPENROUTESERVICE_API_KEY') || ''},
  );
}
