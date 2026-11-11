import { useEffect, useRef, useState } from 'react';
import { createStatusObserver, orderAlert } from './orderAlerts.js';

export default function useOrderAlerts(orderId, order, systemNotifications = true) {
  const observe = useRef(createStatusObserver());
  const audio = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [hint, setHint] = useState('');
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [backgroundTitle, setBackgroundTitle] = useState('');
  const notices = useRef([]);

  function playSound() {
    try {
      const context = audio.current;
      if (!context || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.4);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Visual alerts remain available. */ }
  }

  async function enableAlerts() {
    // Both APIs are invoked directly from the customer's tap.
    let resume;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) { audio.current ||= new Audio(); resume = audio.current.resume().catch(() => {}); }
    } catch { /* Audio is optional. */ }
    let permission = 'unsupported';
    try {
      if ('Notification' in window) {
        permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
      }
    } catch { permission = 'unsupported'; }
    try { await resume; } catch { /* Visual alerts remain available. */ }
    setEnabled(audio.current?.state === 'running');
    playSound();
    setHint(permission === 'granted' ? 'Alerts enabled while this tracking page is open.' : 'System notifications are unavailable or blocked. In-page alerts stay on.');
  }

  useEffect(() => {
    observe.current = createStatusObserver();
    setBanner(null);
    setToast(null);
    setBackgroundTitle('');
  }, [orderId]);

  useEffect(() => {
    if (!order?.status || order.id !== orderId) return;
    const eventKey=[order.status,order.acceptedAt,order.releasedAt,order.confirmedAt,order.arrivedAt].join(':');
    if (!observe.current(eventKey)) return;
    const alert = {...orderAlert(order),eventKey};
    // Keep the latest update visible without stacking outdated status banners.
    setBanner(alert);
    setToast(alert);
    playSound();
    if (document.hidden) setBackgroundTitle(alert.title);
    try {
      if (systemNotifications && 'Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(alert.title, { body: alert.body, tag: `${order.id}:${order.status}` });
        notification.onclick = () => { window.focus(); notification.close(); };
        notices.current.push(notification);
      }
    } catch { /* Some mobile browsers require Web Push; keep the banner. */ }
  }, [order, orderId, systemNotifications]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!backgroundTitle) return;
    const original = document.title;
    let flash = true;
    document.title = `(1) ${backgroundTitle}`;
    const timer = setInterval(() => { flash = !flash; document.title = flash ? `(1) ${backgroundTitle}` : original; }, 1200);
    const reset = () => { if (!document.hidden) { document.title = original; setBackgroundTitle(''); } };
    document.addEventListener('visibilitychange', reset);
    return () => { clearInterval(timer); document.title = original; document.removeEventListener('visibilitychange', reset); };
  }, [backgroundTitle]);

  useEffect(() => () => {
    audio.current?.close().catch(() => {});
    notices.current.forEach(notice => notice.close());
  }, []);

  return { enabled, hint, enableAlerts, banner, toast, dismissBanner: () => setBanner(null) };
}
