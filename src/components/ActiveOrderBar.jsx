import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readOrders } from '../lib/orderHistory.js';
import { terminalStatuses } from '../lib/orderAlerts.js';
import useOrder from '../lib/useOrder.jsx';

function ActiveOrder({ id, onFinished }) {
  const { order, notFound, error } = useOrder(id);
  const finished = notFound || terminalStatuses.has(order?.status);
  useEffect(() => { if (finished) onFinished(id); }, [finished, id, onFinished]);
  if (!order || finished) return null;
  return <aside className="active-order-bar" aria-label="Your active order">
    <div><strong>Your active order</strong><span className={`order-badge badge-${order.status}`}>{order.status==='pending'&&order.releasedAt?'Finding you another rider':order.status.replaceAll('_', ' ')}</span>
      {error && <small>Reconnecting to update status…</small>}</div>
    <Link className="track-order-link" to={`/track/${id}`}>Track</Link>
  </aside>;
}

export default function ActiveOrderBar() {
  const [saved, setSaved] = useState(readOrders);
  const [finished, setFinished] = useState([]);
  useEffect(() => {
    const refresh = () => { setSaved(readOrders()); setFinished([]); };
    window.addEventListener('storage', refresh);
    window.addEventListener('kfc-orders-changed', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('kfc-orders-changed', refresh); };
  }, []);
  const candidate = saved.find(order => !finished.includes(order.id));
  return candidate ? <ActiveOrder key={candidate.id} id={candidate.id} onFinished={id => setFinished(current => current.includes(id) ? current : [...current, id])} /> : null;
}
