import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflight, rejectOrigin } from "../_shared/cors.ts";
import { isUuid, publicOrder } from "../_shared/orders.ts";

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

  try {
    const body = await request.json();
    if (!isUuid(body?.orderId)) return jsonResponse(request, { error: "A valid order ID is required." }, 400);
    const { data, error } = await serviceClient()
      .from("orders")
      .select("id, items, lat, lng, subtotal, distance_km, delivery_charge, total, status, eta_minutes, created_at")
      .eq("id", body.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonResponse(request, { error: "Order not found." }, 404);
    return jsonResponse(request, { order: publicOrder(data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load this order.";
    return jsonResponse(request, { error: message }, 400);
  }
});
