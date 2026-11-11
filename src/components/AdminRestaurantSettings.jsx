import { useEffect, useState } from 'react';
import { adminSupabase } from '../lib/supabase.js';
import { MAX_MINIMUM_ORDER, normalizeRestaurantPhone, parseMinimumOrder } from '../lib/restaurantSettings.js';
import { useRestaurantSettings } from '../context/RestaurantSettingsContext.jsx';

export default function AdminRestaurantSettings() {
  const { applySavedSettings } = useRestaurantSettings();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data, error: requestError } = await adminSupabase.from('restaurant_settings')
        .select('minimum_order_amount,restaurant_phone').eq('id', true).single();
      if (requestError || !data) throw new Error('Unable to load restaurant settings. Apply the restaurant-settings migration, then retry.');
      setForm({ minimum: String(data.minimum_order_amount), phone: data.restaurant_phone });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const values = { minimum_order_amount: parseMinimumOrder(form.minimum), restaurant_phone: normalizeRestaurantPhone(form.phone) };
      const { data, error: requestError } = await adminSupabase.from('restaurant_settings').update(values)
        .eq('id', true).select('minimum_order_amount,restaurant_phone').single();
      if (requestError || !data) throw new Error('Settings were not saved. Check your admin access and connection, then retry.');
      applySavedSettings(data);
      setForm({ minimum: String(data.minimum_order_amount), phone: data.restaurant_phone });
      setMessage('Restaurant settings saved. Existing orders keep their totals.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="admin-restaurant-settings" aria-labelledby="restaurant-settings-title">
    <h2 id="restaurant-settings-title">Minimum order & restaurant contact</h2>
    <p>Set the minimum food amount for new orders and the number used by every restaurant call button.</p>
    {error && <p className="restaurant-settings-error" role="alert">{error}</p>}
    {message && <p className="restaurant-settings-success" role="status">{message}</p>}
    {loading ? <p role="status">Loading restaurant settings…</p> : form ? <form onSubmit={save}>
      <div className="restaurant-settings-fields">
        <label>Minimum order amount (Rs.)
          <input type="number" min="0" max={MAX_MINIMUM_ORDER} step="1" required value={form.minimum} disabled={busy}
            aria-describedby="minimum-order-help" onChange={event => setForm({ ...form, minimum: event.target.value })} />
          <small id="minimum-order-help">Food subtotal only, excluding delivery. Set 0 for no minimum.</small>
        </label>
        <label>Restaurant phone number
          <input type="tel" required maxLength={30} autoComplete="tel" value={form.phone} disabled={busy}
            aria-describedby="restaurant-phone-help" onChange={event => setForm({ ...form, phone: event.target.value })} />
          <small id="restaurant-phone-help">Use your restaurant’s public number, such as 0335 2053652 or +92 335 2053652.</small>
        </label>
      </div>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save restaurant settings'}</button>
    </form> : <button type="button" onClick={load}>Retry restaurant settings</button>}
  </section>;
}
