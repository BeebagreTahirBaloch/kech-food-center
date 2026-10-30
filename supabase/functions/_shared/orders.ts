import { getCatalog } from "../../../src/data/menu.js";

const PRODUCTS = new Map(getCatalog().map((item) => [item.id, item]));
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

export function priceItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("Add between 1 and 50 menu items to your order.");
  }

  return value.map((line) => {
    const requestItem = line && typeof line === "object" ? line as Record<string, unknown> : {};
    const product = PRODUCTS.get(String(requestItem.productId || ""));
    const quantity = Number(requestItem.quantity);
    if (!product) throw new Error("One of the selected menu items is unavailable. Please refresh your cart.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Each item quantity must be between 1 and 99.");

    let option: { label: string; price: number } | undefined;
    if (product.options.length) {
      option = product.options.find((choice) => choice.label === requestItem.optionLabel);
      if (!option) throw new Error(`Choose an available size for ${product.name}.`);
    } else if (requestItem.optionLabel) {
      throw new Error(`The selected option is not available for ${product.name}.`);
    }

    const productPrice = (product as unknown as { price?: number }).price;
    const unitPrice = Number(option?.price ?? productPrice);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 1) throw new Error(`Price is missing for ${product.name}.`);
    return {
      productId: product.id,
      name: product.name,
      image: product.image,
      optionLabel: option?.label || "",
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
    };
  });
}

export function publicOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    items: row.items,
    lat: row.lat,
    lng: row.lng,
    subtotal: row.subtotal,
    distanceKm: row.distance_km,
    deliveryCharge: row.delivery_charge,
    total: row.total,
    status: row.status,
    etaMinutes: row.eta_minutes,
    createdAt: row.created_at,
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
  const match = value.match(/(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
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

  const pathMatch = resolvedUrl.pathname.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (pathMatch) return validateCoordinates(Number(pathMatch[1]), Number(pathMatch[2]));

  const dataMatch = decodeURIComponent(`${resolvedUrl.pathname}${resolvedUrl.search}`).match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (dataMatch) return validateCoordinates(Number(dataMatch[1]), Number(dataMatch[2]));

  for (const key of ["q", "query", "destination", "ll"]) {
    const pair = coordinatePair(resolvedUrl.searchParams.get(key));
    if (pair) return pair;
  }

  throw new Error("We couldn't find coordinates in that Google Maps link. Please drop a pin on the map instead.");
}

export async function calculateRoadDistanceKm(destination: { lat: number; lng: number }) {
  const restaurantLat = Number(Deno.env.get("RESTAURANT_LAT"));
  const restaurantLng = Number(Deno.env.get("RESTAURANT_LNG"));
  if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) throw new Error("Restaurant coordinates are not configured.");

  try {
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${restaurantLng},${restaurantLat};${destination.lng},${destination.lat}?overview=false&alternatives=false&steps=false`;
    const response = await fetch(routeUrl, { signal: AbortSignal.timeout(4500) });
    if (response.ok) {
      const data = await response.json();
      const meters = data?.code === "Ok" ? Number(data.routes?.[0]?.distance) : NaN;
      if (Number.isFinite(meters) && meters > 0) return Math.round((meters / 1000) * 10) / 10;
    }
  } catch { /* Use the road-distance estimate below if OSRM is unavailable. */ }

  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(destination.lat - restaurantLat);
  const dLng = toRadians(destination.lng - restaurantLng);
  const lat1 = toRadians(restaurantLat);
  const lat2 = toRadians(destination.lat);
  const haversine = 2 * 6371 * Math.asin(Math.sqrt(
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2,
  ));
  return Math.round(haversine * 1.3 * 10) / 10;
}

export function suggestedCharge(distanceKm: number) {
  if (distanceKm <= 2) return 100;
  if (distanceKm <= 5) return 200;
  if (distanceKm <= 8) return 300;
  return 400;
}
