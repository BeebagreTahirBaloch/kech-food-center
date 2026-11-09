export function isTelegramEnabled() { return Deno.env.get('TELEGRAM_ENABLED') === 'true'; }
export async function telegram(method: string, payload: Record<string, unknown>) {
  if (!isTelegramEnabled()) return {message_id:null};
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
      cancelRow(orderId),
    ],
  };
}

export function quoteKeyboard(orderId: string) {
  return {
    inline_keyboard: [
      [{ text: "Free delivery", callback_data: `chg_${orderId}_0` }],
      [100, 150, 200].map((amount) => ({ text: `Rs.${amount}`, callback_data: `chg_${orderId}_${amount}` })),
      [300, 400, 500].map((amount) => ({ text: `Rs.${amount}`, callback_data: `chg_${orderId}_${amount}` })),
      cancelRow(orderId),
    ],
  };
}

export function etaKeyboard(orderId: string) {
  return {
    inline_keyboard: [[
      { text: "30 min", callback_data: `eta_${orderId}_30` },
      { text: "1 hour", callback_data: `eta_${orderId}_60` },
      { text: "2 hours", callback_data: `eta_${orderId}_120` },
    ], cancelRow(orderId)],
  };
}

export function outForDeliveryKeyboard(orderId: string) {
  return { inline_keyboard: [[{ text: "Out for delivery", callback_data: `out_${orderId}` }, { text: "Delivered", callback_data: `done_${orderId}` }], cancelRow(orderId)] };
}

export function deliveredKeyboard(orderId: string) {
  return { inline_keyboard: [[{ text: "Delivered", callback_data: `done_${orderId}` }], cancelRow(orderId)] };
}

function cancelRow(orderId: string) {
  return [{ text: 'Cancel delivery', callback_data: `cancel_${orderId}` }];
}
export function cancelKeyboard(orderId: string) {
  return { inline_keyboard: [cancelRow(orderId)] };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

export function riderOrderMessage(order: Record<string, unknown>, heading: string, suggested?: number) {
  const items = Array.isArray(order.items) ? order.items as Record<string, unknown>[] : [];
  return [
    `<b>${escapeHtml(heading)}</b>`,
    `Order ID: <code>${escapeHtml(order.id)}</code>`,
    `Customer name: ${escapeHtml(order.customer_name)}`,
    // Plain phone numbers are auto-linked by supported Telegram clients; tel: links are not universally supported.
    `Customer phone: ${escapeHtml(order.phone)}`,
    `Full address: ${escapeHtml(order.address)}`, '',
    ...items.map(item => `• ${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}${item.optionLabel ? ` (${escapeHtml(item.optionLabel)})` : ''} — Rs.${escapeHtml(item.lineTotal)}`),
    `Subtotal: Rs.${escapeHtml(order.subtotal)}`,
    `Distance: ${escapeHtml(order.distance_km)} km`,
    ...(suggested === undefined ? [] : [`Suggested delivery charge: Rs.${suggested}`]),
    ...(order.delivery_charge == null ? [] : [`Delivery charge: Rs.${escapeHtml(order.delivery_charge)}`]),
    ...(order.total == null ? [] : [`Total: Rs.${escapeHtml(order.total)}`]),
    ...(order.eta_minutes == null ? [] : [`Estimated time: ${escapeHtml(order.eta_minutes)} minutes`]),
  ].join('\n');
}
