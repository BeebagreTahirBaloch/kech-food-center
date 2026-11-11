import { useEffect, useState } from 'react';
import { useCart } from '../context/CartContext.jsx';
import { useMenu } from '../context/MenuContext.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { readOrders, removeSavedOrder } from '../lib/orderHistory.js';
import useOrder from '../lib/useOrder.jsx';
import OrderCountdown from './OrderCountdown.jsx';

const statuses = {
  pending: 'Waiting for rider',
  accepted: 'Rider accepted',
  awaiting_charge: 'Rider accepted',
  quoted: 'Rider accepted',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  declined: 'Cancelled',
};
const finishedStatuses = new Set(['delivered', 'cancelled', 'declined']);
const dateFormat = new Intl.DateTimeFormat('en-PK', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  hour12: true, timeZone: 'Asia/Karachi',
});
const money = value => value == null ? '—' : `Rs. ${Number(value).toLocaleString('en-PK')}`;
const amount = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function itemTotal(item) {
  const savedTotal = amount(item.lineTotal ?? item.line_total);
  const unitPrice = amount(item.unitPrice ?? item.unit_price);
  return savedTotal ?? (unitPrice != null && Number(item.quantity) > 0 ? unitPrice * Number(item.quantity) : null);
}

function OrderCard({ saved, onRemove }) {
  const { orderAgain } = useCart();
  const navigate = useNavigate();
  const { ready, error: menuError } = useMenu();
  const { order, error, loading, notFound, loadOrder } = useOrder(saved.id);
  const [retrying, setRetrying] = useState(false);
  const items = Array.isArray(order?.items) ? order.items.filter(item => item && typeof item === 'object') : [];
  const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const finished = finishedStatuses.has(order?.status);
  const subtotal = amount(order?.subtotal) ?? saved.subtotal;
  const delivery = amount(order?.deliveryCharge);
  const estimate = amount(order?.estimatedDeliveryCharge);
  const total = amount(order?.total) ?? subtotal + (delivery ?? estimate ?? 0);
  const totalLabel = order?.total != null || delivery != null ? 'Total' : estimate != null ? 'Estimated total' : 'Food subtotal';
  const time = Number.isFinite(Date.parse(order?.createdAt)) ? order.createdAt : saved.time;
  const titleId = `saved-order-${saved.id}`;
  const statusLabel = notFound ? 'Unavailable' : loading ? 'Loading…' : statuses[order?.status] || 'Status unavailable';

  async function retry() {
    setRetrying(true);
    try { await loadOrder(); } finally { setRetrying(false); }
  }

  return (
    <article className={`saved-order${order && !finished && !notFound ? ' is-active' : ''}`} aria-labelledby={titleId}>
      <header className="saved-order-heading">
        <div>
          <h2 id={titleId}>Order #{saved.id.slice(0, 8).toUpperCase()}</h2>
          <time dateTime={time}>{dateFormat.format(new Date(time))}</time>
        </div>
        <span className={`order-badge badge-${notFound ? 'unavailable' : order?.status || 'unknown'}`}>{statusLabel}</span>
      </header>

      {notFound ? <div className="saved-order-missing">
        <h3>Order not found</h3>
        <p>This order is no longer available. You can remove it from this browser’s history.</p>
        <button className="orders-button orders-button-secondary" type="button" onClick={onRemove}>Remove</button>
      </div> : <>
        <div className="saved-order-content">
          {order ? <>
            <div className="saved-order-items-heading"><h3>Your items</h3>{itemCount > 0 && <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>}</div>
            {items.length ? <ul className="saved-order-items" aria-label="Ordered items">
              {items.map((item, index) => {
                const size = item.optionLabel ?? item.option_label ?? item.sizeLabel ?? item.size_label;
                return <li key={index}>
                  <span className="saved-order-quantity">{item.quantity} ×</span>
                  <div className="saved-order-item-name"><span>{item.name || 'Menu item'}</span>{size && <small>{size}</small>}</div>
                  <span className="saved-order-item-price">{money(itemTotal(item))}</span>
                </li>;
              })}
            </ul> : <p className="saved-order-hint">Item details are unavailable for this order.</p>}
          </> : loading ? <div className="saved-order-loading" role="status">
            <p>Loading order details…</p><span /><span />
          </div> : null}

          {error && <div className="saved-order-error" role="status">
            <p>{order ? 'Could not refresh this order. Showing the last update.' : 'Couldn’t load this order. Please try again.'}</p>
            <button type="button" onClick={retry} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry'}</button>
          </div>}

          <dl className="saved-order-totals">
            {order && totalLabel !== 'Food subtotal' && <>
              <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
              <div><dt>{delivery != null ? 'Delivery' : 'Estimated delivery'}</dt><dd>{delivery === 0 ? 'Free' : money(delivery ?? estimate)}</dd></div>
            </>}
            <div className="saved-order-grand-total"><dt>{totalLabel}</dt><dd>{money(total)}</dd></div>
          </dl>
          <OrderCountdown order={order} />
          {order?.status === 'delivered' && Number.isFinite(Date.parse(order.deliveredAt)) && <p className="saved-order-completed">Delivered <time dateTime={order.deliveredAt}>{dateFormat.format(new Date(order.deliveredAt))}</time></p>}
        </div>

        <div className="saved-order-actions">
          <Link className={`orders-button orders-button-${finished ? 'secondary' : 'primary'}`} to={`/track/${saved.id}`}>{finished ? 'View order' : 'Track delivery'}</Link>
          {items.length > 0 && <button className={`orders-button orders-button-${finished ? 'primary' : 'secondary'}`} type="button" disabled={!ready || Boolean(menuError)} onClick={() => { orderAgain(order.items); navigate('/cart'); }}>Order again</button>}
          {items.length > 0 && (!ready || menuError) && <p className="saved-order-hint">Waiting for the current menu before ordering again.</p>}
        </div>
      </>}
    </article>
  );
}

export default function MyOrders() {
  const [orders, setOrders] = useState(readOrders);
  useEffect(() => {
    const refresh = () => setOrders(readOrders());
    window.addEventListener('storage', refresh);
    window.addEventListener('kfc-orders-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kfc-orders-changed', refresh);
    };
  }, []);

  return <section className="my-orders" aria-label="Saved orders">
    {orders.length ? <>
      <div className="saved-orders-grid">{orders.map(saved => <OrderCard key={saved.id} saved={saved} onRemove={() => setOrders(removeSavedOrder(saved.id))} />)}</div>
      <p className="orders-history-note">Your latest 20 orders are remembered on this browser. Reorders use current menu prices and availability.</p>
    </> : <div className="orders-empty">
      <span className="orders-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></svg></span>
      <h2>No orders yet</h2>
      <p>Your meals and delivery updates will appear here after you place an order.</p>
      <Link className="orders-button orders-button-primary" to="/">Explore the menu</Link>
    </div>}
  </section>;
}
