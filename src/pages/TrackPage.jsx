import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import OrderAlerts from '../components/OrderAlerts.jsx';
import OrderCountdown from '../components/OrderCountdown.jsx';
import PushAlerts from '../components/PushAlerts.jsx';
import RidersBusyNotice from '../components/RidersBusyNotice.jsx';
import useOrder from '../lib/useOrder.jsx';
import useOrderAlerts from '../lib/useOrderAlerts.js';
import { functionErrorMessage } from '../lib/functionError.js';
import { terminalStatuses } from '../lib/orderAlerts.js';
import { supabase } from '../lib/supabase.js';
import { useCart } from '../context/CartContext.jsx';
import { useRestaurantSettings } from '../context/RestaurantSettingsContext.jsx';
import { suggestedCharge } from '../../supabase/functions/_shared/delivery.js';
import '../tracking.css';

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });
const money = value => `Rs. ${Number(value || 0).toLocaleString('en-PK')}`;
const steps = ['Order sent', 'Rider accepted', 'Out for delivery', 'Delivered'];
const headings = {
  pending: 'Waiting for the rider',
  awaiting_charge: 'Your rider accepted your order',
  quoted: 'Your rider accepted your order',
  confirmed: 'Your rider accepted your order',
  preparing: 'Preparing your order',
  out_for_delivery: 'Your order is on the way',
  delivered: 'Your order was delivered. Enjoy your meal!',
  cancelled: 'Your order was cancelled',
  declined: 'Your order was cancelled',
};

function TrackingIcon({ name, className = '' }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    phone: <path d="m7 3 3 5-2 2c1.4 2.7 3.3 4.6 6 6l2-2 5 3-1 4C10 22 2 14 3 4Z" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    rider: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    delivery: <><path d="M3 5h11v12H3ZM14 10h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  };
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function TrackPage(props) {
  const { id } = useParams();
  return <TrackingOrder key={id} id={id} {...props} />;
}

function TrackingOrder({ id, area, onAreaChange }) {
  const { count } = useCart();
  const { restaurantPhone } = useRestaurantSettings();
  const { order, loading, error, setError, loadOrder, connected } = useOrder(id);
  const [pushEnabled, setPushEnabled] = useState(false);
  const alerts = useOrderAlerts(id, order, !pushEnabled);
  const [cancelError, setCancelError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (order?.status !== 'pending' && !(order?.status === 'out_for_delivery' && order?.arrivedAt)) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [order?.status, order?.arrivedAt]);

  const finished = terminalStatuses.has(order?.status);
  const cancelled = ['cancelled', 'declined'].includes(order?.status);
  const arrived = order?.status === 'out_for_delivery' && Boolean(order?.arrivedAt);
  const step = ({ pending: 0, awaiting_charge: 1, quoted: 1, confirmed: 1, preparing: 1, out_for_delivery: 2, delivered: 3 })[order?.status] ?? -1;
  const estimate = order?.estimatedDeliveryCharge ?? (Number.isFinite(order?.distanceKm) ? suggestedCharge(order.distanceKm) : null);
  const total = order?.total ?? (Number(order?.subtotal || 0) + Number(order?.deliveryCharge ?? estimate ?? 0));
  const totalLabel = order?.total != null || order?.deliveryCharge != null ? 'Total' : estimate != null ? 'Estimated total' : 'Subtotal';
  const itemCount = (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const waited = Math.max(0, Math.floor((now - Date.parse(order?.releasedAt || order?.createdAt)) / 60000)) || 0;
  const waitExpired = arrived && now > Date.parse(order.arrivedAt) + (order.waitMinutes ?? 10) * 60000;
  const title = order?.status === 'pending' && order.releasedAt ? 'Finding you another rider'
    : arrived ? 'Your rider has arrived'
    : headings[order?.status] || 'Checking your order';
  const statusIcon = cancelled ? 'close' : order?.status === 'pending' ? 'clock'
    : order?.status === 'out_for_delivery' ? 'delivery' : 'check';

  async function cancelOrder() {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    setCancelError('');
    try {
      const { data, error: requestError } = await supabase.functions.invoke('cancel-order', { body: { orderId: id } });
      if (requestError) {
        if (requestError.context?.status === 409) await loadOrder();
        throw new Error(await functionErrorMessage(requestError, 'Unable to cancel the order. Please contact the restaurant.'));
      }
      if (!data?.cancelled) throw new Error('Cancellation was not confirmed. Please refresh the order before trying again.');
      await loadOrder();
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  }

  async function customerHere() {
    setCancelling(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke('customer-here', { body: { orderId: id } });
      if (requestError) throw new Error('Unable to record your response. The wait time may have ended.');
      if (!data?.ok) throw new Error(data?.error || 'Unable to record your response.');
      await loadOrder();
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  }

  return <>
    <Header count={count} area={area} onAreaChange={onAreaChange} />
    <main className="track-page tracking-page">
      <header className="track-heading">
        <div><p className="eyebrow">KECH FOOD CENTER · TURBAT</p><h1>Track your order</h1></div>
        <div className="tracking-meta">
          <p className="track-code">Order #{id?.slice(0, 8).toUpperCase()}</p>
          <span className={`live-connection ${connected ? 'is-connected' : ''}`} role="status">{connected ? 'Connected' : 'Reconnecting...'}</span>
        </div>
      </header>

      <OrderAlerts {...alerts} />
      {loading && <div className="track-card tracking-loading" role="status"><div className="loading-spinner" />Loading your order...</div>}
      {error && <div className="track-card track-error" role="alert"><p>{error}</p><button type="button" onClick={loadOrder}>Try again</button></div>}
      {cancelError && <div className="track-card track-error" role="alert"><p>{cancelError}</p>{order?.status === 'pending' && <button type="button" disabled={cancelling} onClick={cancelOrder}>Try cancellation again</button>}</div>}

      {order && <div className="tracking-columns">
        <div className="tracking-primary">
          <section className={`tracking-status-panel status-${order.status}`} aria-labelledby="tracking-status-title">
            <div className="tracking-status-heading">
              <span className="tracking-status-icon"><TrackingIcon name={statusIcon} /></span>
              <div><p className="tracking-caption">Order status</p><h2 id="tracking-status-title">{title}</h2></div>
            </div>

            {order.status === 'pending' && <>
              <p className="tracking-status-description">Your order is confirmed. We’ll update you when a rider accepts.</p>
              <div className="tracking-waiting"><TrackingIcon name="clock" /><span>{waited === 0 ? 'Sent just now' : `Waiting ${waited} ${waited === 1 ? 'minute' : 'minutes'} for a rider`}</span></div>
              <RidersBusyNotice orderPlaced />
            </>}
            {order.status === 'awaiting_charge' && <p className="tracking-status-description">Your rider is setting the delivery details. We’ll update them here.</p>}
            {order.status === 'quoted' && order.etaMinutes != null && <p className="tracking-status-description">Estimated delivery time: {order.etaMinutes} minutes.</p>}
            {cancelled && <p className="tracking-status-description">{order.cancelledBy === 'rider' && order.cancelReason === 'no_answer'
              ? 'Order cancelled because the rider could not reach you.'
              : 'For help with this order, please contact the restaurant.'}</p>}

            <OrderCountdown order={order} prominent />

            {arrived && <div className="tracking-arrived">
              <p>Please meet your rider. You can ask them to wait once.</p>
              {order.customerHereUsed || order.customerHereAt
                ? <p role="status">{order.customerHereAt ? 'Your response was recorded. The wait time has restarted.' : 'You already used your one wait extension for this order.'}</p>
                : <><button type="button" className="track-order-link" disabled={cancelling || waitExpired} onClick={customerHere}>{cancelling ? 'Saving...' : "I'm here"}</button>
                  {waitExpired && <p>The wait time has ended. Please call your rider.</p>}</>}
            </div>}

            <ol className={`order-steps${cancelled ? ' is-cancelled' : ''}`} aria-label="Delivery progress">
              {steps.map((label, index) => <li key={label} className={index < step ? 'complete' : index === step ? 'current' : ''} aria-current={index === step ? 'step' : undefined}>
                <span className="tracking-step-dot" aria-hidden="true">{index < step || order.status === 'delivered' ? <TrackingIcon name="check" /> : index + 1}</span>
                <span>{label}</span>
              </li>)}
            </ol>
          </section>

          {!finished && <section className="tracking-contact-card" aria-labelledby="tracking-contact-title">
            <span className="tracking-contact-icon"><TrackingIcon name={order.rider ? 'rider' : 'phone'} /></span>
            <div className="tracking-contact-info"><p className="tracking-caption">{order.rider ? 'Your rider' : 'Need an update?'}</p>
              <h2 id="tracking-contact-title">{order.rider?.name || 'Kech Food Center'}</h2>
              {order.rider?.phone && <p>{order.rider.phone}</p>}
            </div>
            <a className="track-order-link" href={`tel:${order.rider?.phone || restaurantPhone}`}><TrackingIcon name="phone" />{order.rider?.phone ? 'Call rider' : 'Call restaurant'}</a>
          </section>}

          {order.status === 'pending' && <div className="tracking-cancel-row"><span>Changed your mind?</span>
            <button type="button" className="cancel-quote-button" disabled={cancelling} onClick={cancelOrder}>{cancelling ? 'Cancelling...' : 'Cancel order'}</button>
          </div>}
        </div>

        <aside className="tracking-secondary" aria-label="Order details and alerts">
          <section className="tracking-summary-card" aria-labelledby="tracking-summary-title">
            <div className="tracking-summary-heading"><h2 id="tracking-summary-title">Order summary</h2><span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span></div>
            <div className="tracking-total"><span>{totalLabel}</span><strong>{money(total)}</strong></div>
            <details className="tracking-disclosure tracking-order-details">
              <summary><span>View order details</span><TrackingIcon name="chevron" className="tracking-chevron" /></summary>
              <div className="tracking-disclosure-content">
                <div className="tracking-items">{(order.items || []).map((item, index) => <div className="tracking-item" key={index}>
                  <span>{item.quantity} × {item.name}{(item.optionLabel || item.option_label) && <small>{item.optionLabel || item.option_label}</small>}</span>
                  <strong>{money(item.lineTotal ?? item.line_total ?? (item.unitPrice ?? item.unit_price) * item.quantity)}</strong>
                </div>)}</div>
                <div className="tracking-totals">
                  <div><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div>
                  <div><span>{order.deliveryCharge != null ? 'Delivery charge' : 'Estimated delivery'}</span><strong>{order.deliveryCharge != null || estimate != null ? money(order.deliveryCharge ?? estimate) : 'Pending'}</strong></div>
                </div>
                {order.estimatedDeliveryCharge != null && order.deliveryCharge != null && order.estimatedDeliveryCharge !== order.deliveryCharge
                  && <p className="tracking-price-note">Estimated {money(order.estimatedDeliveryCharge)} → Final {money(order.deliveryCharge)}</p>}
                {order.deliveryCharge == null && <p className="alert-hint">This is an estimate. The rider sets the final delivery charge.</p>}
              </div>
            </details>

            {order.lat != null && order.lng != null && <details className="tracking-disclosure tracking-location" onToggle={event => setMapOpen(event.currentTarget.open)}>
              <summary><span><TrackingIcon name="pin" />Delivery location{order.distanceKm != null && <small>{order.distanceKm} km</small>}</span><TrackingIcon name="chevron" className="tracking-chevron" /></summary>
              <div className="tracking-disclosure-content">
                {mapOpen && <MapContainer center={[Number(order.lat), Number(order.lng)]} zoom={15} scrollWheelZoom={false} className="tracking-map">
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[Number(order.lat), Number(order.lng)]}><Popup>Delivery location</Popup></Marker>
                </MapContainer>}
              </div>
            </details>}
          </section>

          {!finished && <details className="tracking-alert-settings tracking-disclosure">
            <summary><span className="tracking-alert-label"><TrackingIcon name="bell" /><span>Order alerts<small>Sound & notifications</small></span></span><TrackingIcon name="chevron" className="tracking-chevron" /></summary>
            <div className="tracking-disclosure-content">
              <div className="tracking-sound-settings"><h3>While this page is open</h3><p>Play a soft sound when your order changes.</p>
                <button type="button" className="track-order-link" onClick={alerts.enableAlerts}>{alerts.enabled ? 'Sound enabled · Alert settings' : 'Enable sound and alerts'}</button>
                {alerts.hint && <p className="alert-hint" role="status">{alerts.hint}</p>}
              </div>
              <PushAlerts orderId={id} embedded onEnabledChange={setPushEnabled} />
            </div>
          </details>}
        </aside>
      </div>}

      <div className="tracking-page-links"><Link className="back-to-menu" to="/">← Back to the menu</Link><p>Need help? <a href={`tel:${restaurantPhone}`}>Contact restaurant</a></p></div>
    </main>
    <Footer />
  </>;
}
