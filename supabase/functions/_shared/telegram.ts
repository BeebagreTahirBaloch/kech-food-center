export async function telegram(method: string, payload: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Telegram bot token is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed.`);
  return result.result;
}

export function riderChatId() {
  const chatId = Deno.env.get("TELEGRAM_RIDER_CHAT_ID");
  if (!chatId) throw new Error("Rider chat ID is not configured.");
  return chatId;
}

export function orderKeyboard(orderId: string, navigateUrl: string) {
  return {
    inline_keyboard: [
      [
        { text: "Accept", callback_data: `accept_${orderId}` },
        { text: "Decline", callback_data: `decline_${orderId}` },
      ],
      [{ text: "Navigate", url: navigateUrl }],
    ],
  };
}

export function quoteKeyboard(orderId: string) {
  return {
    inline_keyboard: [
      [100, 150, 200].map((amount) => ({ text: `Rs.${amount}`, callback_data: `chg_${orderId}_${amount}` })),
      [300, 400, 500].map((amount) => ({ text: `Rs.${amount}`, callback_data: `chg_${orderId}_${amount}` })),
    ],
  };
}

export function etaKeyboard(orderId: string) {
  return {
    inline_keyboard: [[
      { text: "30 min", callback_data: `eta_${orderId}_30` },
      { text: "1 hour", callback_data: `eta_${orderId}_60` },
      { text: "2 hours", callback_data: `eta_${orderId}_120` },
    ]],
  };
}

export function outForDeliveryKeyboard(orderId: string) {
  return { inline_keyboard: [[{ text: "Out for delivery", callback_data: `out_${orderId}` }]] };
}

export function deliveredKeyboard(orderId: string) {
  return { inline_keyboard: [[{ text: "Delivered", callback_data: `done_${orderId}` }]] };
}
