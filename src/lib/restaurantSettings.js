export const DEFAULT_RESTAURANT_PHONE = '03352053652';
export const MAX_MINIMUM_ORDER = 2000000;

export function normalizeRestaurantPhone(value) {
  const phone = String(value ?? '').trim().replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(phone)) {
    throw new Error('Enter a valid restaurant phone number with 7–15 digits, for example 03352053652 or +923352053652.');
  }
  return phone;
}

export function parseMinimumOrder(value) {
  const amount = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MINIMUM_ORDER) {
    throw new Error('Enter a whole-rupee minimum from 0 to 2,000,000.');
  }
  return amount;
}

export function readRestaurantSettings(row) {
  if (!row) throw new Error('Restaurant settings are unavailable.');
  return {
    minimumOrderAmount: parseMinimumOrder(row.minimum_order_amount),
    restaurantPhone: normalizeRestaurantPhone(row.restaurant_phone),
  };
}
