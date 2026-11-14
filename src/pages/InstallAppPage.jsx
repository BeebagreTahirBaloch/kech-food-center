import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAppInstall } from '../context/AppInstallContext.jsx';
import '../install-app.css';

export default function InstallAppPage() {
  const { count } = useCart();
  const { installed, available, busy, message, install } = useAppInstall();
  const [device, setDevice] = useState(() => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iphone' : 'android');
  useEffect(() => {
    // Reuse the customer notification worker without requesting permissions.
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/notifications-sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return <><Header count={count} compactLogo />
    <main className="install-app-page">
      <section className="install-app-card" aria-labelledby="install-title">
        <img className="install-app-logo" src="/rider-icon-192.png" alt="Kech Food Center" width="88" height="88" />
        <span className="install-app-eyebrow">KECH FOOD CENTER · TURBAT</span>
        <h1 id="install-title">Your favourites.<br />One tap away.</h1>
        <p className="install-app-intro">Add Kech Food Center to your home screen. Browse the menu, place an order and follow your delivery in one place.</p>
        <div className="install-app-benefits"><span>Easy access</span><span>Live order tracking</span><span>Automatic updates</span></div>
        {installed ? <div className="install-app-installed" role="status"><strong>You’re all set!</strong><p>Kech Food Center is ready to use on this device.</p><Link to="/">Browse the menu →</Link></div>
          : <>{available || busy ? <button className="install-app-button" disabled={busy} onClick={install}>{busy ? 'Opening installation…' : 'Install app'}</button>
            : <a className="install-app-button" href="#install-instructions">See install steps <span aria-hidden="true">↓</span></a>}
            <p className="install-app-note">Free to install. Internet is needed to order and track deliveries.</p></>}
        {!installed && message && <p className="install-app-message" role="status">{message}</p>}
      </section>
      {!installed && <section id="install-instructions" className="install-app-instructions" aria-labelledby="install-help-title">
        <h2 id="install-help-title">Install on your device</h2>
        <div className="install-device-options" role="group" aria-label="Your device">{[['android','Android'],['iphone','iPhone / iPad'],['desktop','Computer']].map(([key,label]) => <button key={key} aria-pressed={device === key} onClick={() => setDevice(key)}>{label}</button>)}</div>
        {device === 'android' ? <ol><li>Open this website in <strong>Chrome</strong>.</li><li>Tap <strong>Install app</strong> above if available, or open Chrome’s <strong>three-dot menu</strong>.</li><li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>, then confirm.</li></ol>
          : device === 'iphone' ? <ol><li>Open this website in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. You may need to scroll or use Edit Actions to find it.</li><li>Keep <strong>Open as Web App</strong> enabled if shown, then tap <strong>Add</strong>.</li></ol>
          : <ol><li>Open this website in <strong>Chrome or Edge</strong>.</li><li>Click <strong>Install app</strong> above if available, or look for the install option in the address bar or browser menu.</li><li>Confirm the installation, then open Kech Food Center from your apps.</li></ol>}
        <p className="install-app-help">Can’t see an install option? Open this page in your phone’s browser instead of the browser inside WhatsApp or another app. You can also keep ordering on the website.</p>
        <p className="install-app-help">Want delivery alerts? Enable them on your order’s tracking page after installing. Notifications are optional.</p>
      </section>}
      <Link className="install-back-link" to="/">← Back to the menu</Link>
    </main><Footer /></>;
}
