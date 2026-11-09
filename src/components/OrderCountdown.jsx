import { useEffect, useState } from 'react';
import { countdown } from '../lib/orderHistory.js';
export default function OrderCountdown({order}) {
  const [now,setNow]=useState(Date.now);
  const active=['confirmed','preparing','out_for_delivery'].includes(order?.status);
  useEffect(()=>{ if(!active) return; setNow(Date.now()); const timer=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(timer); },[active,order?.confirmedAt,order?.etaMinutes,order?.arrivalEtaAt]);
  const text=countdown(order,now);
  return text ? <div className="order-countdown" role="status">{text.includes(':')?'Estimated arrival in ':''}<strong>{text}</strong>{order.arrivalEtaAt&&<p>Updated arrival time: {new Date(order.arrivalEtaAt).toLocaleTimeString('en-PK',{hour:'numeric',minute:'2-digit'})}</p>}{text==='Taking longer than estimated'&&<p>We’re sorry for the delay. <a href={order.rider?.phone?`tel:${order.rider.phone}`:'tel:03352053652'}>{order.rider?.phone?'Call rider':'Call restaurant'}</a></p>}</div> : null;
}
