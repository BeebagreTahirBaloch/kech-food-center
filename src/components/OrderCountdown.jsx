import { useEffect, useState } from 'react';
import { countdown } from '../lib/orderHistory.js';
import { useRestaurantSettings } from '../context/RestaurantSettingsContext.jsx';
export default function OrderCountdown({order, prominent=false}) {
  const { restaurantPhone } = useRestaurantSettings();
  const [now,setNow]=useState(Date.now);
  const active=['confirmed','preparing','out_for_delivery'].includes(order?.status);
  useEffect(()=>{ if(!active) return; setNow(Date.now()); const timer=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(timer); },[active,order?.confirmedAt,order?.etaMinutes,order?.arrivalEtaAt]);
  const text=countdown(order,now);
  if (prominent && text) {
    const late = text === 'Taking longer than estimated';
    const revised = Date.parse(order.arrivalEtaAt);
    const arrival = Number.isFinite(revised) ? revised : Date.parse(order.confirmedAt) + Number(order.etaMinutes) * 60000;
    return <div className={`tracking-arrival${late ? ' is-delayed' : ''}`}>
      {late ? <><strong role="status">{text}</strong><p>We’re sorry for the delay. Contact {order.rider?.phone ? 'your rider' : 'the restaurant'} for an update.</p></> : <>
        <span className="tracking-caption">Estimated arrival in</span>
        <div className="tracking-arrival-time"><strong role="timer" aria-live="off">{text}</strong>
          {Number.isFinite(arrival) && <span>{order.arrivalEtaAt ? 'Updated to' : 'Around'} <time dateTime={new Date(arrival).toISOString()}>{new Date(arrival).toLocaleTimeString('en-PK', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Karachi' })}</time></span>}
        </div>
      </>}
    </div>;
  }
  return text ? <div className="order-countdown" role="status">{text.includes(':')?'Estimated arrival in ':''}<strong>{text}</strong>{order.arrivalEtaAt&&<p>Updated arrival time: {new Date(order.arrivalEtaAt).toLocaleTimeString('en-PK',{hour:'numeric',minute:'2-digit'})}</p>}{text==='Taking longer than estimated'&&<p>We’re sorry for the delay. <a href={`tel:${order.rider?.phone || restaurantPhone}`}>{order.rider?.phone?'Call rider':'Call restaurant'}</a></p>}</div> : null;
}
