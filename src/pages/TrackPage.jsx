import { functionErrorMessage } from '../lib/functionError.js';
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
import { supabase } from '../lib/supabase.js';
import { useCart } from '../context/CartContext.jsx';
import { suggestedCharge } from '../../supabase/functions/_shared/delivery.js';
L.Icon.Default.mergeOptions({iconRetinaUrl:markerIcon2x,iconUrl:markerIcon,shadowUrl:markerShadow});
const money=n=>`Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
const headings={pending:'Waiting for the rider',awaiting_charge:'Your rider accepted your order',quoted:'Your rider accepted your order',confirmed:'Your rider accepted your order',preparing:'Preparing your order',out_for_delivery:'Your order is on the way',delivered:'Your order was delivered. Enjoy your meal!',cancelled:'Your order was cancelled',declined:'Your order was cancelled'};
export default function TrackPage({area,onAreaChange}) {
 const {id}=useParams(); const {count}=useCart();
 const {order,loading,error,setError,loadOrder,connected}=useOrder(id);
 const [pushEnabled,setPushEnabled]=useState(false);
 useEffect(()=>setPushEnabled(false),[id]);
 const [cancelError,setCancelError]=useState('');
 const [cancelling,setCancelling]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const steps=['Order sent','Rider accepted','Out for delivery','Delivered'];
 const step=({pending:0,awaiting_charge:1,quoted:1,confirmed:1,preparing:1,out_for_delivery:2,delivered:3})[order?.status] ?? -1;
 const estimate=order?.estimatedDeliveryCharge ?? (Number.isFinite(order?.distanceKm) ? suggestedCharge(order.distanceKm) : null);
 async function cancelOrder(){
  if(!window.confirm('Cancel this order?'))return;
  setCancelling(true);setCancelError('');
  try {
   const {data,error}=await supabase.functions.invoke('cancel-order',{body:{orderId:id}});
   if(error){if(error.context?.status===409)await loadOrder();throw new Error(await functionErrorMessage(error,'Unable to cancel the order. Please contact the restaurant.'));}
   if(!data?.cancelled)throw new Error('Cancellation was not confirmed. Please refresh the order before trying again.');
   await loadOrder();
  }catch(e){setCancelError(e.message);}finally{setCancelling(false);}
 }
 return <><Header count={count} area={area} onAreaChange={onAreaChange}/><main className="track-page">
  <OrderAlerts key={id} order={order?.id===id?order:null} connected={connected} systemNotifications={!pushEnabled}/>
  <div className="track-heading"><p className="eyebrow">KECH FOOD CENTER · TURBAT</p><h1>Track your order</h1><p className="track-code">Order {id?.slice(0,8).toUpperCase()}</p></div>
  {loading && <div className="track-card"><div className="loading-spinner"/>Loading your order...</div>}
  {error && <div className="track-card track-error" role="alert"><p>{error}</p><button onClick={loadOrder}>Try again</button></div>}
  {cancelError && <div className="track-card track-error" role="alert"><p>{cancelError}</p>{order?.status==='pending'&&<button disabled={cancelling} onClick={cancelOrder}>Try cancellation again</button>}</div>}
  {order && <div className="track-layout">
   <ol className="order-steps" aria-label="Delivery progress">{steps.map((text,i)=><li key={text} className={i<step?'complete':i===step?'current':''} aria-current={i===step?'step':undefined}>{text}</li>)}</ol>
   <OrderCountdown order={order}/>
   {order.status==='pending'&&<section className="track-card"><p>Your order has been waiting {Math.max(0,Math.floor((now-Date.parse(order.releasedAt||order.createdAt))/60000))} minutes for a rider.</p><RidersBusyNotice/><a className="track-order-link" href="tel:03352053652">Call restaurant</a></section>}
   {!['delivered','cancelled','declined'].includes(order.status)&&<PushAlerts key={id} orderId={id} onEnabledChange={setPushEnabled}/>}
   <section className={`track-status-card status-${order.status}`}><div><span className="status-label">{order.status.replaceAll('_',' ')}</span><h2>{order.status==='pending'&&order.releasedAt?'Finding you another rider':order.status==='cancelled'&&order.cancelledBy==='rider'&&order.cancelReason==='no_answer'?'Order cancelled because the rider could not reach you.':headings[order.status]}</h2>{order.status==='pending' && <p>Your order was confirmed when you sent it. Waiting for the rider to set the delivery details.</p>}</div>{order.distanceKm!=null && <span className="distance-pill">{order.distanceKm} km</span>}</section>
   {order.rider && <section className="track-card"><h2>Your rider: {order.rider.name}</h2><p>{order.rider.phone}</p><a className="track-order-link" href={`tel:${order.rider.phone}`}>Call rider</a></section>}
   {order.status==='out_for_delivery'&&order.arrivedAt&&<section className="quote-card"><h2>Your rider has arrived</h2><p>Please meet your rider. You can ask them to wait once.</p>{order.customerHereUsed || order.customerHereAt?<p>{order.customerHereAt?'Your response was recorded. The wait time has restarted.':'You already used your one wait extension for this order.'}</p>:<button className="track-order-link" disabled={cancelling||now>Date.parse(order.arrivedAt)+(order.waitMinutes??10)*60000} onClick={async()=>{setCancelling(true);try{const {data,error}=await supabase.functions.invoke('customer-here',{body:{orderId:id}});if(error)throw Error('Unable to record your response. The wait time may have ended.');if(!data.ok)throw Error(data.error);await loadOrder();}catch(e){setError(e.message);}finally{setCancelling(false);}}}>I'm here</button>}</section>}
   {order.status==='pending' && <button className="cancel-quote-button" disabled={cancelling} onClick={cancelOrder}>{cancelling?'Cancelling...':'Cancel order'}</button>}
   {['quoted','confirmed','preparing'].includes(order.status) && <section className="quote-card"><h2>Your rider accepted your order</h2><div><span>Delivery charge</span><strong>{money(order.deliveryCharge)}</strong></div><div><span>Estimated time</span><strong>{order.etaMinutes} minutes</strong></div><div className="quote-total"><span>Final total</span><strong>{money(order.total)}</strong></div><p>No further customer confirmation is needed.</p></section>}
   <div className="track-layout-grid"><section className="track-card order-summary"><h2>Order summary</h2><div className="tracking-items">{(order.items || []).map((item,i)=><div className="tracking-item" key={i}><span>{item.quantity} × {item.name}{(item.optionLabel || item.option_label) && ` · ${item.optionLabel || item.option_label}`}</span><strong>{money(item.lineTotal ?? item.line_total ?? (item.unitPrice ?? item.unit_price)*item.quantity)}</strong></div>)}</div>
    <div className="tracking-totals"><div><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div>
     {order.deliveryCharge!=null ? <div><span>Delivery charge</span><strong>{money(order.deliveryCharge)}</strong></div> : estimate!=null && <div><span>Estimated delivery charges</span><strong>{money(estimate)}</strong></div>}
     {order.estimatedDeliveryCharge!=null && order.deliveryCharge!=null && order.estimatedDeliveryCharge!==order.deliveryCharge && <p>Estimated {money(order.estimatedDeliveryCharge)} &gt; Final {money(order.deliveryCharge)}</p>}
     <div className="tracking-grand-total"><span>{order.total!=null?'Total':estimate!=null?'Estimated total':'Subtotal so far'}</span><strong>{money(order.total ?? (order.subtotal+(estimate ?? 0)))}</strong></div>
    </div>{order.deliveryCharge==null && <p className="alert-hint">This is an estimate. The rider sets the final delivery charge.</p>}
   </section>
   {order.lat!=null && order.lng!=null && <section className="track-card tracking-map-card"><h2>Delivery location</h2><MapContainer center={[Number(order.lat),Number(order.lng)]} zoom={15} scrollWheelZoom className="tracking-map"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={[Number(order.lat),Number(order.lng)]}><Popup>Delivery location</Popup></Marker></MapContainer></section>}
   </div><p className="tracking-help">Need help? <a href="tel:03352053652">Call Kech Food Center · 0335 2053652</a></p>
  </div>}<Link className="back-to-menu" to="/">Back to the menu</Link>
 </main><Footer/></>;
}
