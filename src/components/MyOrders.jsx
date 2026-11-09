import { useEffect,useState } from 'react';
import {useCart} from '../context/CartContext.jsx';
import {useMenu} from '../context/MenuContext.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { readOrders,removeSavedOrder } from '../lib/orderHistory.js';
import useOrder from '../lib/useOrder.jsx';
import OrderCountdown from './OrderCountdown.jsx';
function OrderCard({saved,onRemove}) {
 const {orderAgain}=useCart();const navigate=useNavigate();const {ready,error:menuError}=useMenu();
 const {order,error,loading,notFound}=useOrder(saved.id);
 return <article className="saved-order"><div><strong>Order #{saved.id.slice(0,8).toUpperCase()}</strong><p><time dateTime={saved.time}>{new Date(saved.time).toLocaleString()}</time></p></div>
 {notFound ? <><p>Order not found</p><button onClick={onRemove}>Remove</button></> : <>
 <span className={`order-badge badge-${order?.status || 'pending'}`}>{loading?'Loading…':order?.status?.replaceAll('_',' ') || 'Status unavailable'}</span>
 <p>{order?.total==null?'Subtotal':'Total'}: Rs. {Number(order?.total ?? order?.subtotal ?? saved.subtotal).toLocaleString('en-PK')}</p>
 {error && <p role="status">Could not refresh this order. Retrying shortly.</p>}<OrderCountdown order={order}/><Link className="track-order-link" to={`/track/${saved.id}`}>Track delivery</Link>{order&&<><button className="track-order-link" disabled={!ready||Boolean(menuError)} onClick={()=>{orderAgain(order.items);navigate('/cart');}}>Order again</button>{(!ready||menuError)&&<p>Waiting for the current menu before ordering again.</p>}</>}
 </> }</article>;
}
export default function MyOrders() {
 const [orders,setOrders]=useState(readOrders);
 useEffect(()=>{const refresh=()=>setOrders(readOrders());window.addEventListener('storage',refresh);window.addEventListener('kfc-orders-changed',refresh);return ()=>{window.removeEventListener('storage',refresh);window.removeEventListener('kfc-orders-changed',refresh);};},[]);
 return <section className="my-orders"><h2>My Orders</h2>{orders.length ? <div className="saved-orders-grid">{orders.map(saved=><OrderCard key={saved.id} saved={saved} onRemove={()=>setOrders(removeSavedOrder(saved.id))}/>)}</div> : <p>No orders yet</p>}</section>;
}
