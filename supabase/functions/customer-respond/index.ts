import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflight, rejectOrigin } from "../_shared/cors.ts";
import { isUuid, publicOrder } from "../_shared/orders.ts";
import { isTelegramEnabled, outForDeliveryKeyboard, riderChatId, riderOrderMessage, telegram } from "../_shared/telegram.ts";

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
    const orderId = body?.orderId;
    const action = body?.action;
    if (!isUuid(orderId) || !["confirm", "cancel"].includes(action)) {
      return jsonResponse(request, { error: "Send a valid order ID and choose confirm or cancel." }, 400);
    }

    const supabase = serviceClient();
    const { data: current, error: lookupError } = await supabase
      .from("orders")
      .select("id, customer_name, phone, address, lat, lng, items, subtotal, distance_km, delivery_charge, total, status, eta_minutes, created_at, confirmed_at, out_for_delivery_at, delivered_at, telegram_message_id, telegram_chat_id")
      .eq("id", orderId)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!current) return jsonResponse(request, { error: "Order not found." }, 404);
    if (current.status !== "quoted") return jsonResponse(request, { error: "This order is no longer waiting for confirmation." }, 409);

    const status = action === "confirm" ? "confirmed" : "cancelled";
    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId)
      .eq("status", "quoted")
      .select("id, items, lat, lng, subtotal, distance_km, delivery_charge, total, status, eta_minutes, created_at, confirmed_at, out_for_delivery_at, delivered_at, telegram_message_id, telegram_chat_id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) return jsonResponse(request, { error: "Another update arrived first. Refresh the tracking page." }, 409);

    if (isTelegramEnabled() && (updated.telegram_chat_id || Deno.env.get("TELEGRAM_RIDER_CHAT_ID"))) {
      const chatId = updated.telegram_chat_id || riderChatId();
      const text = action === "confirm"
        ? riderOrderMessage({ ...current, ...updated }, 'Customer confirmed')
        : `Customer cancelled order #${orderId.slice(0, 8).toUpperCase()}.`;
      try {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text,
          reply_markup: action === "confirm" ? outForDeliveryKeyboard(orderId) : { inline_keyboard: [] },
        });
        await supabase.from("orders").update({telegram_message_id: sent.message_id, telegram_chat_id: String(chatId)}).eq("id",orderId);
        if (updated.telegram_message_id) await telegram("editMessageReplyMarkup", {
          chat_id:chatId, message_id:updated.telegram_message_id, reply_markup:{inline_keyboard:[]}
        });
      } catch (telegramError) {
        const message = "Telegram rider update failed. Check server configuration.";
        console.error("Rider notification after customer response failed");
        await supabase.from("orders").update({ telegram_error: message }).eq("id", orderId);
      }
    }

    return jsonResponse(request, { order: publicOrder(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update this order.";
    return jsonResponse(request, { error: message }, 400);
  }
});
