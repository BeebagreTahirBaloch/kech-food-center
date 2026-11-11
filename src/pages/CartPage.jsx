import RidersBusyNotice from '../components/RidersBusyNotice.jsx';
import {checkoutRequest,clearCheckoutRequest} from '../lib/checkoutRequest.js';
import DeliveryEstimate from '../components/DeliveryEstimate.jsx';
import useOrderingHours from '../hooks/useOrderingHours.js';
import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import DeliveryLocationMap from "../components/DeliveryLocationMap.jsx";
import Footer from "../components/Footer.jsx";
import Header from "../components/Header.jsx";
import ActiveOrderBar from "../components/ActiveOrderBar.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useMenu } from "../context/MenuContext.jsx";
import { useRestaurantSettings } from '../context/RestaurantSettingsContext.jsx';
import { saveOrder } from '../lib/orderHistory.js';
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

const deliveryAreas = ["Absor", "Satellite Town", "Overseas", "B&R Colony", "Turbat Bazar"];

function formatOrderingTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

export default function CartPage({ area, onAreaChange }) {
  const { items, count, subtotal, changeQuantity, removeItem, notice, clear } = useCart();
  const { loading: menuLoading, error: menuError, refresh } = useMenu();
  const { minimumOrderAmount, loading: settingsLoading, ready: settingsReady, error: settingsError, refresh: refreshSettings } = useRestaurantSettings();
  const belowMinimum = subtotal < minimumOrderAmount;
  const minimumRemaining = Math.max(0, minimumOrderAmount - subtotal);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", area: area || "" });
  const [locationMode, setLocationMode] = useState("pin");
  const [location, setLocation] = useState(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState(null);
  const [rateRefresh,setRateRefresh]=useState(0);
  const estimateKey = locationMode === 'pin' ? JSON.stringify(location) : googleMapsUrl.trim();
  const estimatedCharge = deliveryEstimate?.mode === locationMode && deliveryEstimate?.key === estimateKey ? deliveryEstimate.charge : null;
  const estimatedTotal = estimatedCharge != null ? subtotal + estimatedCharge : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const sending=useRef(false);
  const orderingHours = useOrderingHours();
  const orderingClosed = orderingHours?.isOpen === false;

  function updateCustomer(event) {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
    if (name === "area") onAreaChange(value);
  }

  async function placeOrder(event) {
    event.preventDefault();
    if(sending.current)return;
    setError("");
    if(orderingClosed)return setError('Ordering is currently closed. Please try again when ordering resumes.');
    if (!settingsReady || settingsError) return setError('Please reload restaurant settings before ordering.');
    if (belowMinimum) return setError(`Minimum food order is ${formatPrice(minimumOrderAmount)}, excluding delivery. Add ${formatPrice(minimumRemaining)} more to order.`);
    if(estimatedTotal == null)return setError('Please calculate your delivery charge before sending the order.');
    if (!items.length) return setError("Add at least one item before placing your order.");
    if (menuLoading || menuError) return setError('Please reload the menu before ordering.');
    if (!isSupabaseConfigured) return setError("Connect Supabase first. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
    if (locationMode === "pin" && !location) return setError("Drop a pin on the map or use your current location.");
    if (locationMode === "link" && !googleMapsUrl.trim()) return setError("Paste a Google Maps link or choose a pin on the map.");

    sending.current=true;
    setSubmitting(true);
    try {
      const body={
        deliveryCharge:estimatedCharge,reviewedSubtotal:subtotal,
        customer:{name:customer.name,phone:customer.phone,address:customer.address},
        deliveryLocation:locationMode==='pin'?location:{googleMapsUrl:googleMapsUrl.trim()},
        items:items.map(item=>({itemId:item.itemId,sizeId:item.sizeId,quantity:item.quantity})),
      };
      const requestId=await checkoutRequest(body);
      const {data,error:functionError}=await supabase.functions.invoke('create-order',{body:{...body,requestId}});
      if (functionError) {
        let details = functionError.message;
        try {
          const response = await functionError.context?.json();
          details = response?.error || details;
          if(response?.retryAfter)details+=` Try again in ${response.retryAfter} seconds.`;
          if(functionError.context?.status===400 || response?.code==='DELIVERY_RATE_CHANGED')clearCheckoutRequest();
          if(response?.code==='MENU_PRICE_CHANGED'){clearCheckoutRequest();await refresh();}
          if(response?.code==='MINIMUM_ORDER_NOT_MET'){clearCheckoutRequest();await refreshSettings();}
          if(response?.code==='DELIVERY_RATE_CHANGED'){setDeliveryEstimate(null);setRateRefresh(n=>n+1);}
        } catch { /* Keep the SDK message if the response isn't JSON. */ }
        throw new Error(details || "We couldn't send your order. Please try again.");
      }
      if (!data?.orderId) throw new Error(data?.error || "The order service did not return an order ID.");
      saveOrder(data.orderId, data.subtotal ?? subtotal, data.createdAt || new Date().toISOString());
      clearCheckoutRequest();
      clear();
      navigate(`/track/${data.orderId}`);
    } catch (submitError) {
      setError(submitError.message || "We couldn't send your order. Please try again.");
    } finally {
      sending.current=false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header count={count} compactLogo />
      <main className="page-wrapper cart-page">
        {notice && <p role="status">{notice}</p>}
        {menuLoading && <p role="status">Loading current menu prices…</p>}
        {menuError && <p role="alert">{menuError} <button onClick={refresh}>Reload menu</button></p>}
        <section className="cart-left">
          <ActiveOrderBar />
          <div className="cart-header"><Link to="/" className="back-btn" aria-label="Back to menu"><i className="ri-arrow-left-s-line" /></Link><h1>MY CART</h1></div>
          <hr />
          <div className="cart-items-container">
            {items.length ? items.map((item) => (
              <article className="cart-item" key={`${item.productId}:${item.label}`}>
                <div className="cart-item-left">
                  <img src={item.image} alt="" />
                  <div><p className="cart-item-name">{item.name}{item.label && ` · ${item.label}`}</p><p className="cart-item-price">{formatPrice(item.price)} each</p></div>
                </div>
                <div className="cart-item-controls">
                  <button className="delete-btn" onClick={() => removeItem(item)} aria-label={`Remove ${item.name}`}><i className="ri-delete-bin-line" /></button>
                  <button className="add-btn" onClick={() => changeQuantity(item, -1)} aria-label={`Decrease ${item.name}`}>−</button>
                  <span className="cart-item-qty">{item.quantity}</span>
                  <button className="add-btn" onClick={() => changeQuantity(item, 1)} aria-label={`Increase ${item.name}`}>+</button>
                </div>
                <p className="cart-item-total">{formatPrice(item.price * item.quantity)}</p>
              </article>
            )) : (
              <div className="empty-cart"><p>Your cart is empty. Find something delicious from the menu.</p><Link to="/"><button type="button">START YOUR ORDER</button></Link></div>
            )}
          </div>
          <div className="you-may-like"><hr /><h2>Ready for something delicious?</h2><p>Our menu is made fresh in Turbat.</p><Link className="text-link" to="/">Browse the menu <i className="ri-arrow-right-line" /></Link></div>
        </section>

        <section className="cart-right">
          <form onSubmit={placeOrder}>
            <div className="order-details-box">
              <h2>Delivery details</h2>
              <RidersBusyNotice/>
              {(orderingHours?.enabled || orderingHours?.paused) && <div className="delivery-charge-note ordering-hours-notice" role="status"><span>{orderingHours.paused?'Ordering is temporarily stopped. Please check back later.':`${orderingClosed?'Ordering is closed.':'Orders are open.'} Order daily from ${formatOrderingTime(orderingHours.opensAt)} to ${formatOrderingTime(orderingHours.closesAt)} (Turbat time).`}</span></div>}
              <div className="info-card"><i className="ri-store-2-line" /><div><p className="info-label">FROM</p><p className="info-value">KECH FOOD CENTER · Turbat</p></div></div>
              <label className="checkout-field"><span>Your name</span><input name="name" value={customer.name} onChange={updateCustomer} placeholder="Enter your name" autoComplete="name" required minLength={2} maxLength={80} /></label>
              <label className="checkout-field"><span>Phone number</span><input type="tel" name="phone" value={customer.phone} onChange={updateCustomer} placeholder="03xx xxxxxxx" autoComplete="tel" required maxLength={20} /></label>
              <label className="checkout-field"><span>Delivery area</span><select name="area" value={customer.area} onChange={updateCustomer}><option value="">Select your area</option>{deliveryAreas.map((deliveryArea) => <option key={deliveryArea}>{deliveryArea}</option>)}</select></label>
              <label className="checkout-field"><span>Full address</span><textarea name="address" value={customer.address} onChange={updateCustomer} placeholder="House, street, and nearby landmark" required minLength={5} maxLength={250} rows={3} /></label>

              <fieldset className="location-choice">
                <legend>Choose your delivery location</legend>
                <label><input type="radio" name="location-mode" value="pin" checked={locationMode === "pin"} onChange={() => setLocationMode("pin")} /><span>Drop a pin</span></label>
                <label><input type="radio" name="location-mode" value="link" checked={locationMode === "link"} onChange={() => setLocationMode("link")} /><span>Paste a Google Maps link</span></label>
              </fieldset>

              {locationMode === "pin" ? (
                <DeliveryLocationMap location={location} onLocationChange={setLocation} />
              ) : (
                <label className="checkout-field maps-link-field"><span>Google Maps link</span><input type="url" value={googleMapsUrl} onChange={(event) => setGoogleMapsUrl(event.target.value)} placeholder="https://maps.app.goo.gl/..." required /></label>
              )}

              <div className="price-breakdown"><div className="price-row"><span>Items subtotal</span><span>{formatPrice(subtotal)}</span></div></div>
              {settingsLoading ? <p className="checkout-settings-status" role="status">Checking restaurant settings…</p>
                : settingsError ? <div className="checkout-minimum-notice is-below" role="alert"><p>{settingsError}</p><button type="button" onClick={refreshSettings}>Retry restaurant settings</button></div>
                : minimumOrderAmount > 0 && <div className={`checkout-minimum-notice${belowMinimum ? ' is-below' : ' is-met'}`} role="status">
                  <strong>Minimum food order: {formatPrice(minimumOrderAmount)}</strong>
                  <p>{belowMinimum ? `Add ${formatPrice(minimumRemaining)} more to place your order.` : 'Your cart meets the minimum order.'} Delivery is charged separately.</p>
                  {belowMinimum && <Link to="/">Add more items →</Link>}
                </div>}
              <DeliveryEstimate mode={locationMode} location={location} mapsUrl={googleMapsUrl} subtotal={subtotal} onEstimateChange={setDeliveryEstimate} showTotal={false} refreshKey={rateRefresh} />
              <div className="delivery-charge-note"><i className="ri-information-line" /><span>Delivery charge is calculated using the restaurant’s distance-based rates.</span></div>
              <div className="checkout-estimated-total" aria-live="polite"><div><strong>Total</strong><span>Including delivery</span></div>{estimatedTotal != null ? <strong className="checkout-total-amount">{formatPrice(estimatedTotal)}</strong> : <span className="checkout-estimate-pending">Select location</span>}</div>
              {error && <p className="checkout-error" role="alert">{error}</p>}
              <button type="submit" className="confirm-button" disabled={submitting || items.length === 0 || orderingClosed || estimatedTotal == null || !settingsReady || Boolean(settingsError) || belowMinimum || menuLoading || Boolean(menuError)}>
                {orderingClosed ? 'ORDERING CLOSED' : submitting ? "SENDING ORDER…" : belowMinimum ? `ADD ${formatPrice(minimumRemaining)} MORE` : estimatedTotal != null ? `SEND ORDER · ${formatPrice(estimatedTotal)}` : 'SEND ORDER'}
              </button>
              <p className="checkout-note">Sending your order confirms it. Your delivery charge is fixed. The rider will set the estimated arrival time.</p>
            </div>
          </form>
        </section>
      </main>
      <Footer />
    </>
  );
}
