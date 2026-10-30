import { createClient } from "npm:@supabase/supabase-js@2";
import { isUuid } from "../_shared/orders.ts";
import { deliveredKeyboard, etaKeyboard, outForDeliveryKeyboard, quoteKeyboard, riderChatId, telegram } from "../_shared/telegram.ts";

const CHARGES = new Set([100, 150, 200, 300, 400, 500]);
const ETAS = new Set([30, 60, 120]);

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function editRiderMessage(chatId: string | number, messageId: number, text: string, replyMarkup = { inline_keyboard: [] as unknown[] }) {
  await telegram("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup });
}

async function getOrder(supabase: ReturnType<typeof serviceClient>, id: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, subtotal, delivery_charge, total, status, telegram_message_id, telegram_chat_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function transition(supabase: ReturnType<typeof serviceClient>, id: string, from: string, updates: Record<string, unknown>, deliveryCharge?: number) {
  let query = supabase.from("orders").update(updates).eq("id", id).eq("status", from);
  if (deliveryCharge !== undefined) query = query.eq("delivery_charge", deliveryCharge);
  const { data, error } = await query.select("id, subtotal, delivery_charge, total, status, eta_minutes").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function processCallback(callback: Record<string, unknown>) {
  const message = callback.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  const callbackId = typeof callback.id === "string" ? callback.id : "";
  const data = typeof callback.data === "string" ? callback.data : "";
  const configuredRiderChat = riderChatId();
  const chatId = chat?.id as string | number | undefined;

  if (!callbackId) return;
  if (!message || chatId === undefined || chatId === null || String(chatId) !== configuredRiderChat) {
    await telegram("answerCallbackQuery", { callback_query_id: callbackId, text: "This order button is not assigned to this rider.", show_alert: true });
    return;
  }

  await telegram("answerCallbackQuery", { callback_query_id: callbackId });
  const messageId = Number(message.message_id);
  if (!Number.isSafeInteger(messageId)) return;
  const match = data.match(/^(accept|decline|chg|eta|out|done)_([0-9a-f-]{36})(?:_(\d+))?$/i);
  if (!match || !isUuid(match[2])) {
    await editRiderMessage(chatId, messageId, "This order action is invalid.");
    return;
  }

  const [, action, orderId, rawValue] = match;
  const supabase = serviceClient();
  const order = await getOrder(supabase, orderId);
  if (!order) {
    await editRiderMessage(chatId, messageId, "This order could not be found.");
    return;
  }

  if (action === "accept") {
    if (order.status !== "pending") return;
    const updated = await transition(supabase, orderId, "pending", { status: "awaiting_charge" });
    if (updated) await editRiderMessage(chatId, messageId, `ORDER #${orderId.slice(0, 8).toUpperCase()} ACCEPTED\nChoose the delivery charge:`, quoteKeyboard(orderId));
    return;
  }

  if (action === "decline") {
    if (order.status !== "pending") return;
    const updated = await transition(supabase, orderId, "pending", { status: "declined" });
    if (updated) await editRiderMessage(chatId, messageId, `ORDER #${orderId.slice(0, 8).toUpperCase()} DECLINED. The customer has been updated.`);
    return;
  }

  if (action === "chg") {
    const charge = Number(rawValue);
    if (order.status !== "awaiting_charge" || !CHARGES.has(charge) || charge > 1000) return;
    const updated = await transition(supabase, orderId, "awaiting_charge", { delivery_charge: charge });
    if (updated) await editRiderMessage(chatId, messageId, `Delivery charge selected: Rs.${charge}\nChoose the delivery ETA:`, etaKeyboard(orderId));
    return;
  }

  if (action === "eta") {
    const eta = Number(rawValue);
    if (order.status !== "awaiting_charge" || order.delivery_charge == null || !ETAS.has(eta)) return;
    const charge = Number(order.delivery_charge);
    const updated = await transition(supabase, orderId, "awaiting_charge", {
      status: "quoted",
      eta_minutes: eta,
      total: Number(order.subtotal) + charge,
    }, charge);
    if (updated) {
      const text = `ORDER #${orderId.slice(0, 8).toUpperCase()}\nDelivery charge: Rs.${charge}\nETA: ${eta} minutes\nTotal: Rs.${updated.total}\n\nWaiting for the customer to confirm.`;
      await editRiderMessage(chatId, messageId, text);
    }
    return;
  }

  if (action === "out") {
    if (order.status !== "confirmed") return;
    const updated = await transition(supabase, orderId, "confirmed", { status: "out_for_delivery" });
    if (updated) await editRiderMessage(chatId, messageId, `ORDER #${orderId.slice(0, 8).toUpperCase()}\nOut for delivery.`, deliveredKeyboard(orderId));
    return;
  }

  if (action === "done") {
    if (order.status !== "out_for_delivery") return;
    const updated = await transition(supabase, orderId, "out_for_delivery", { status: "delivered" });
    if (updated) await editRiderMessage(chatId, messageId, `ORDER #${orderId.slice(0, 8).toUpperCase()}\nDelivered. Thank you!`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) return new Response("Unauthorized", { status: 401 });

  let update: Record<string, unknown>;
  try { update = await request.json(); } catch { return new Response("ok", { status: 200 }); }
  const callback = update.callback_query;
  if (callback && typeof callback === "object") {
    const task = processCallback(callback as Record<string, unknown>).catch((error) => {
      console.error("Telegram callback failed:", error instanceof Error ? error.message : error);
    });
    const runtime = (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(task);
    else await task;
  }
  return Response.json({ ok: true }, { status: 200 });
});
