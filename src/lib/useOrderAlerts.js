import { useEffect, useRef, useState } from 'react';
import { createStatusObserver, orderAlert } from './orderAlerts.js';
import { useAlertPreference, saveAlertPreference, readAlertPreference, unlockAlertAudio, playAlertSound } from './alertPreferences.js';

export default function useOrderAlerts(orderId, order, systemNotifications = true) {
  const observe = useRef(createStatusObserver());
  const enabled = useAlertPreference('kfc_customer_sound') === true;
  const [hint, setHint] = useState('');
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [backgroundTitle, setBackgroundTitle] = useState('');
  const notices = useRef([]);

  function playSound() {
    playAlertSound('customer');
  }

  async function enableAlerts() {
    // Both APIs are invoked directly from the customer's tap.
    saveAlertPreference('kfc_customer_sound', true);
    saveAlertPreference('kfc_customer_notifications', true);
    const resume = unlockAlertAudio();
    let permission = 'unsupported';
    try {
      if ('Notification' in window) {
        permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
      }
    } catch { permission = 'unsupported'; }
    try { await resume; } catch { /* Visual alerts remain available. */ }
    playSound();
    setHint(permission === 'granted' ? 'Preference saved on this browser. Sound and page alerts stay on for future visits.' : 'Sound preference saved. System notifications are unavailable or blocked; in-page alerts stay on.');
  }

  function disableAlerts() {
    saveAlertPreference('kfc_customer_sound', false);
    saveAlertPreference('kfc_customer_notifications', false);
    notices.current.forEach(notice => notice.close());
    setHint('Sound and page notifications are off. Banners stay on. Manage push alerts separately below.');
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
      if (systemNotifications && readAlertPreference('kfc_customer_notifications') !== false && 'Notification' in window && Notification.permission === 'granted') {
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
    notices.current.forEach(notice => notice.close());
  }, []);

  return { enabled, hint, enableAlerts, disableAlerts, banner, toast, dismissBanner: () => setBanner(null) };
}
