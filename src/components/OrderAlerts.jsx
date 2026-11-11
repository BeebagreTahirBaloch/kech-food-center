export default function OrderAlerts({ banner, toast, dismissBanner }) {
  return <div className="tracking-notices">
    <div aria-live="polite" aria-atomic="true">
      {banner && <div className="order-alert-banner">
        <div><strong>{banner.title}</strong>{banner.body && <p>{banner.body}</p>}</div>
        <button type="button" aria-label={`Close: ${banner.title}`} onClick={dismissBanner}>×</button>
      </div>}
    </div>
    {toast && <div className="order-alert-toast" aria-hidden="true">{toast.title}</div>}
  </div>;
}
