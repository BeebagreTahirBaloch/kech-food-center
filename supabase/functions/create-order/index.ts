import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflight, rejectOrigin } from "../_shared/cors.ts";
import { calculateRoadDistanceKm, parseDeliveryLocation, priceItems, suggestedCharge, validateCustomer } from "../_shared/orders.ts";
import { orderKeyboard, riderChatId, telegram } from "../_shared/telegram.ts";

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
    const customer = validateCustomer(body?.customer);
    const location = await parseDeliveryLocation(body?.deliveryLocation);
    const items = priceItems(body?.items);
    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal > 2_000_000) throw new Error("Order total is too high. Please review your cart.");
    const distanceKm = await calculateRoadDistanceKm(location);
    const supabase = serviceClient();

    const { data: order, error: insertError } = await supabase
      .from("orders")
      .insert({
        customer_name: customer.name,
        phone: customer.phone,
        address: customer.address,
        lat: location.lat,
        lng: location.lng,
        items,
        subtotal,
        distance_km: distanceKm,
        delivery_charge: null,
        total: null,
        status: "pending",
        eta_minutes: null,
        telegram_error: null,
      })
      .select("id, created_at")
      .single();

    if (insertError || !order) {
      console.error("Order insert failed:", insertError?.message);
      return jsonResponse(request, { error: "We couldn't save your order. Please try again." }, 500);
    }

    const code = String(order.id).slice(0, 8).toUpperCase();
    const suggested = suggestedCharge(distanceKm);
    const itemLines = items.map((item) => `• ${item.quantity} × ${item.name}${item.optionLabel ? ` (${item.optionLabel})` : ""} — Rs.${item.lineTotal}`).join("\n");
    const riderMessage = [
      `NEW KECH FOOD CENTER ORDER #${code}`,
      "",
      itemLines,
      "",
      `Subtotal: Rs.${subtotal}`,
      `Distance: ${distanceKm.toFixed(1)} km`,
      `Suggested delivery charge: Rs.${suggested}`,
      "",
      `Customer: ${customer.name}`,
      `Phone: ${customer.phone}`,
      `Address: ${customer.address}`,
    ].join("\n");
    const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
    let telegramError: string | null = null;
    let messageId: number | null = null;
    let chatId: string | null = null;

    try {
      chatId = riderChatId();
      const sentMessage = await telegram("sendMessage", {
        chat_id: chatId,
        text: riderMessage,
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
      telegramError = error instanceof Error ? error.message.slice(0, 1000) : "Telegram notification failed.";
      console.error("Telegram order notification failed:", telegramError);
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ telegram_error: telegramError, telegram_message_id: messageId, telegram_chat_id: chatId })
      .eq("id", order.id);
    if (updateError) console.error("Order notification metadata update failed:", updateError.message);

    return jsonResponse(request, { orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to place this order.";
    return jsonResponse(request, { error: message }, 400);
  }
});
