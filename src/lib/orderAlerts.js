export const terminalStatuses = new Set(['delivered', 'cancelled', 'declined']);

export function orderAlert(order) {
  const titles = {
    pending: 'Your order was sent',
    awaiting_charge: 'Your rider accepted your order',
    quoted: 'Your rider accepted your order',
    confirmed: 'Your rider accepted your order',
    preparing: 'Your order is being prepared',
    out_for_delivery: 'Your order is on the way',
    delivered: 'Your order was delivered. Enjoy your meal!',
    cancelled: 'Your order was cancelled',
    declined: 'Your order was cancelled',
  };
  const title = order.status==='pending' && order.releasedAt ? 'Finding you another rider' : order.status==='out_for_delivery' && order.arrivedAt ? 'Your rider has arrived' : order.status==='cancelled' && order.cancelledBy==='rider' && order.cancelReason==='no_answer' ? 'Order cancelled because the rider could not reach you.' : titles[order.status] || 'Your order status changed';
  const charge = order.deliveryCharge ?? order.delivery_charge;
  const eta = order.etaMinutes ?? order.eta_minutes;
  const money = value => `Rs. ${Number(value).toLocaleString('en-PK')}`;
  const body = ['awaiting_charge', 'quoted', 'confirmed'].includes(order.status)
    ? [charge == null ? 'Delivery charge is being set' : `Delivery charge: ${money(charge)}`,
       order.total == null ? 'Total is being calculated' : `Total: ${money(order.total)}`,
       eta == null ? 'Estimated time is being set' : `Estimated time: ${eta} minutes`].join(' · ')
    : '';
  return { status: order.status, title, body };
}

// The first response is a baseline, not a new event. Repeated polls and
// reconnect broadcasts cannot announce the same status twice per visit.
export function createStatusObserver() {
  const seen = new Set();
  let initialized = false;
  return status => {
    if (!status) return false;
    const changed = initialized && !seen.has(status);
    initialized = true;
    seen.add(status);
    return changed;
  };
}
