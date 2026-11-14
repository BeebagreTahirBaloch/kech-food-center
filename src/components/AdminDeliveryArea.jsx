import { useEffect, useState } from 'react';
import { adminSupabase } from '../lib/supabase.js';

export default function AdminDeliveryArea() {
  const [radius, setRadius] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data, error: failed } = await adminSupabase.from('restaurant_settings').select('delivery_radius_km').eq('id', true).single();
      if (failed || data?.delivery_radius_km == null) throw Error('Unable to load the delivery area. Apply the delivery security migration, then retry.');
      setRadius(String(data.delivery_radius_km));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const km = Number(radius);
      if (!radius.trim() || !Number.isFinite(km) || km < 0.5 || km > 100 || Math.abs(km * 100 - Math.round(km * 100)) > 0.000001) throw Error('Enter a delivery radius from 0.5 to 100 km, with up to two decimal places.');
      const { data, error: failed } = await adminSupabase.from('restaurant_settings').update({ delivery_radius_km: km })
        .eq('id', true).select('delivery_radius_km').single();
      if (failed || !data) throw Error('Delivery area was not saved. Check your admin access and connection, then retry.');
      setRadius(String(data.delivery_radius_km));
      setMessage(`Delivery area saved: within ${data.delivery_radius_km} km of the restaurant. Existing orders are unchanged.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="admin-restaurant-settings" aria-labelledby="delivery-area-title">
    <h2 id="delivery-area-title">Delivery service area</h2>
    <p>Choose how far from the restaurant customers can place new orders.</p>
    {error && <p className="restaurant-settings-error" role="alert">{error}</p>}
    {message && <p className="restaurant-settings-success" role="status">{message}</p>}
    {loading ? <p role="status">Loading delivery area…</p> : radius !== null ? <form onSubmit={save}>
      <div className="restaurant-settings-fields"><label>Maximum delivery radius (km)
        <input type="number" min="0.5" max="100" step="0.01" required value={radius} disabled={busy}
          aria-describedby="delivery-area-help" onChange={e => setRadius(e.target.value)} />
        <small id="delivery-area-help">Measured in a straight line from the restaurant. Road distance still determines the delivery charge. Locations outside this area cannot place new orders.</small>
      </label></div>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save delivery area'}</button>
    </form> : <button type="button" onClick={load}>Retry delivery area</button>}
  </section>;
}
