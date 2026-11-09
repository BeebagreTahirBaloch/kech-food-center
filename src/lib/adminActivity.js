const entities = {
  menu_items: 'Menu item', item_sizes: 'Item size', categories: 'Category',
  delivery_rates: 'Delivery rates', ordering_hours: 'Ordering hours',
  delivery_settings: 'Delivery settings', riders: 'Rider account', rider_capacity: 'Rider capacity',
};
const actions = {INSERT: 'Added', UPDATE: 'Updated', DELETE: 'Deleted'};
const fields = {
  name: 'Name', label: 'Size', category_id: 'Category', base_price: 'Price', price: 'Price',
  is_available: 'Availability', is_deleted: 'Menu visibility', active: 'Rider account',
  enabled: 'Ordering schedule', paused: 'Ordering paused', opens_at: 'Opening time', closes_at: 'Closing time',
  tiers: 'Delivery rates', max_active_orders: 'Maximum active orders per rider',
  nearby_order_km: 'Maximum distance between deliveries', wait_minutes: 'Customer wait time',
  cancel_rate_threshold: 'Cancellation alert threshold', pending_alert_minutes: 'Waiting-order alert after',
  stalled_alert_minutes: 'No-progress alert after', sort_order: 'Display order',
};

export function activityHeading(event) {
  const subject = event.after_data?.name || event.before_data?.name || event.after_data?.label || event.before_data?.label;
  return {
    entity: entities[event.entity] || 'Settings',
    action: actions[event.action] || 'Changed',
    subject: subject || '',
  };
}

export function activityActor(event) {
  if (event.actor_email?.trim()) return event.actor_email.trim();
  if (event.actor_type === 'system') return 'Server / SQL Editor';
  if (event.actor_type === 'account_removed') return 'Deleted account';
  return 'Admin account';
}

export function activityTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(date);
}

function clockTime(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return 'Time unavailable';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}
const money = value => `Rs. ${Number(value).toLocaleString('en-PK')}`;
const stable = value => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);

function fieldValue(key, data, categoryName) {
  if (!data) return ['Not present'];
  if (!(key in data)) return ['Not set'];
  const value = data[key];
  if (key === 'base_price' && value === null) return ['Priced by size'];
  if (value === null || value === '') return ['Not set'];
  if (key === 'category_id') return [categoryName || 'Category no longer available'];
  if (key === 'opens_at' || key === 'closes_at') return [clockTime(value)];
  if (key === 'base_price' || key === 'price') return [money(value)];
  if (key === 'is_available') return [value ? 'Available' : 'Sold out'];
  if (key === 'is_deleted') return [value ? 'Hidden' : 'Visible'];
  if (key === 'active') return [value ? 'Enabled' : 'Disabled'];
  if (key === 'enabled') return [value ? 'On' : 'Off'];
  if (key === 'paused') return [value ? 'Yes' : 'No'];
  if (key === 'nearby_order_km') return [`${value} km`];
  if (key.endsWith('_minutes')) return [`${value} ${Number(value) === 1 ? 'minute' : 'minutes'}`];
  if (key === 'cancel_rate_threshold') return [`${value}%`];
  if (key === 'tiers' && Array.isArray(value)) return value.length ? value.map((tier, index) => {
    const previous = value[index - 1]?.maxKm;
    const range = tier.maxKm == null
      ? (index ? `Over ${previous} km` : 'All distances')
      : (index ? `Over ${previous}–${tier.maxKm} km` : `0–${tier.maxKm} km`);
    return `${range} · ${money(tier.charge)}`;
  }) : ['No delivery rates'];
  return [typeof value === 'object' ? 'Updated' : String(value)];
}

export function activityChanges(event) {
  const before = event.before_data, after = event.after_data;
  // Only readable audited fields belong in the UI; never show IDs or unrelated data.
  return Object.entries(fields)
    .filter(([key]) => (before && key in before) || (after && key in after))
    .filter(([key]) => event.action !== 'UPDATE' || stable(before?.[key]) !== stable(after?.[key]))
    .map(([key, label]) => ({
      key, label,
      before: fieldValue(key, before, event.before_category_name),
      after: fieldValue(key, after, event.after_category_name),
    }));
}
