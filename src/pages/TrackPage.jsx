import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import Footer from "../components/Footer.jsx";
import Header from "../components/Header.jsx";
import { useCart } from "../context/CartContext.jsx";
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const statusText = {
  pending: ["Waiting for the rider", "Your order is on its way to the rider."],
  awaiting_charge: ["Rider is setting the delivery charge", "The rider accepted your order and is choosing a delivery charge and ETA."],
  quoted: ["Your delivery quote is ready", "Review the delivery charge and final total, then confirm or cancel."],
  confirmed: ["Order confirmed", "The rider has your confirmation and is preparing your order."],
  out_for_delivery: ["Out for delivery", "The rider is on the way with your order."],
  delivered: ["Delivered", "Enjoy your meal. Thank you for ordering from Kech Food Center!"],
  declined: ["Rider unavailable", "The rider could not take this order. Please call us for help."],
  cancelled: ["Order cancelled", "This order has been cancelled."],
};

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

function formatStatus(status) {
  return status?.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) || "Order update";
}

function normalizeOrder(order) {
  return {
    ...order,
    deliveryCharge: order.deliveryCharge ?? order.delivery_charge,
    distanceKm: order.distanceKm ?? order.distance_km,
    etaMinutes: order.etaMinutes ?? order.eta_minutes,
  };
}

async function responseError(error, fallback) {
  try {
    const body = await error.context?.json();
    return body?.error || error.message || fallback;
  } catch {
    return error.message || fallback;
  }
}

export default function TrackPage({ area, onAreaChange }) {
  const { id } = useParams();
  const { count } = useCart();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [responding, setResponding] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to view order tracking. Add the VITE_SUPABASE values to your .env file.");
      setLoading(false);
      return;
    }
    try {
      const { data, error: functionError } = await supabase.functions.invoke("get-order", { body: { orderId: id } });
      if (functionError) throw new Error(await responseError(functionError, "We couldn't load this order."));
      if (!data?.order) throw new Error(data?.error || "We couldn't find this order.");
      setOrder(normalizeOrder(data.order));
      setError("");
    } catch (loadError) {
      setError(loadError.message || "We couldn't load this order. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to view order tracking. Add the VITE_SUPABASE values to your .env file.");
      setLoading(false);
      return undefined;
    }

    setOrder(null);
    setLoading(true);
    loadOrder();
    const channel = supabase
      .channel(`order:${id}`, { config: { private: false } })
      .on("broadcast", { event: "order_update" }, ({ payload }) => {
        // Public broadcasts are refresh signals; only trust the saved server order.
        if (active && payload?.id === id) loadOrder();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadOrder();
      });

    const refreshTimer = window.setInterval(loadOrder, 30000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [id, loadOrder]);

  async function respond(action) {
    setResponding(true);
    setError("");
    try {
      const { data, error: functionError } = await supabase.functions.invoke("customer-respond", { body: { orderId: id, action } });
      if (functionError) throw new Error(await responseError(functionError, "We couldn't update your order."));
      if (!data?.order) throw new Error(data?.error || "We couldn't update your order.");
      setOrder(normalizeOrder(data.order));
    } catch (respondError) {
      setError(respondError.message || "We couldn't update your order. Please try again.");
    } finally {
      setResponding(false);
    }
  }

  const [heading, description] = statusText[order?.status] || [formatStatus(order?.status), "Order status is updating."];

  return (
    <>
      <Header count={count} area={area} onAreaChange={onAreaChange} />
      <main className="track-page">
        <div className="track-heading">
          <p className="eyebrow">KECH FOOD CENTER · TURBAT</p>
          <h1>Track your order</h1>
          <p className="track-code">Order {id?.slice(0, 8).toUpperCase()}</p>
        </div>

        {loading && <div className="track-card"><div className="loading-spinner" /><p>Loading your order…</p></div>}
        {!loading && error && !order && <div className="track-card track-error" role="alert"><i className="ri-error-warning-line" /><p>{error}</p><button onClick={loadOrder}>Try again</button></div>}

        {order && (
          <div className="track-layout">
            <section className={`track-status-card status-${order.status}`}>
              <div className="track-status-symbol"><i className={order.status === "delivered" ? "ri-checkbox-circle-fill" : order.status === "declined" || order.status === "cancelled" ? "ri-close-circle-fill" : "ri-e-bike-2-line"} /></div>
              <div><span className="status-label">{formatStatus(order.status)}</span><h2>{heading}</h2><p>{description}</p></div>
              {order.distanceKm != null && <span className="distance-pill"><i className="ri-route-line" /> {Number(order.distanceKm).toFixed(1)} km</span>}
            </section>

            {order.status === "quoted" && (
              <section className="quote-card">
                <div><span>Delivery charge</span><strong>{formatPrice(order.deliveryCharge)}</strong></div>
                {order.etaMinutes && <div><span>Estimated time</span><strong>{order.etaMinutes} minutes</strong></div>}
                <div className="quote-total"><span>Final total</span><strong>{formatPrice(order.total)}</strong></div>
                <p>The rider has set this charge based on the route distance. Confirm to send the order to the kitchen.</p>
                <div className="quote-actions">
                  <button className="confirm-quote-button" disabled={responding} onClick={() => respond("confirm")}>{responding ? "PLEASE WAIT…" : "CONFIRM ORDER"}</button>
                  <button className="cancel-quote-button" disabled={responding} onClick={() => respond("cancel")}>CANCEL</button>
                </div>
              </section>
            )}

            {error && <p className="checkout-error track-inline-error" role="alert">{error}</p>}

            <div className="track-layout-grid">
              <section className="track-card order-summary">
                <h2>Order summary</h2>
                <div className="tracking-items">
                  {(order.items || []).map((item) => (
                    <div className="tracking-item" key={`${item.productId || item.product_id}:${item.optionLabel || item.option_label}`}>
                      <span>{item.quantity} × {item.name}{(item.optionLabel || item.option_label) && ` · ${item.optionLabel || item.option_label}`}</span>
                      <strong>{formatPrice(item.lineTotal ?? item.line_total ?? (item.unitPrice ?? item.unit_price) * item.quantity)}</strong>
                    </div>
                  ))}
                </div>
                <div className="tracking-totals"><div><span>Subtotal</span><strong>{formatPrice(order.subtotal)}</strong></div>
                  {order.deliveryCharge != null && <div><span>Delivery charge</span><strong>{formatPrice(order.deliveryCharge)}</strong></div>}
                  <div className="tracking-grand-total"><span>{order.total == null ? "Subtotal so far" : "Total"}</span><strong>{formatPrice(order.total ?? order.subtotal)}</strong></div>
                </div>
              </section>

              {order.lat != null && order.lng != null && (
                <section className="track-card tracking-map-card">
                  <h2>Delivery location</h2>
                  <MapContainer center={[Number(order.lat), Number(order.lng)]} zoom={15} scrollWheelZoom className="tracking-map">
                    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[Number(order.lat), Number(order.lng)]}><Popup>Delivery location</Popup></Marker>
                  </MapContainer>
                </section>
              )}
            </div>
            <p className="tracking-help">Need help? <a href="tel:03352053652">Call Kech Food Center · 0335 2053652</a></p>
          </div>
        )}
        <Link className="back-to-menu" to="/">Back to the menu</Link>
      </main>
      <Footer />
    </>
  );
}
