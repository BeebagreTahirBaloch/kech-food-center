import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { DEFAULT_RESTAURANT_PHONE, readRestaurantSettings } from '../lib/restaurantSettings.js';

const RestaurantSettingsContext = createContext(null);

export function RestaurantSettingsProvider({ children }) {
  const [settings, setSettings] = useState({ minimumOrderAmount: 0, restaurantPhone: DEFAULT_RESTAURANT_PHONE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const requestNumber = useRef(0);

  const applySavedSettings = useCallback(row => {
    const value = readRestaurantSettings(row);
    requestNumber.current++;
    setSettings(value);
    setReady(true);
    setError('');
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const current = ++requestNumber.current;
    try {
      if (!supabase) throw new Error('Restaurant settings are unavailable.');
      const { data, error: requestError } = await supabase.from('restaurant_settings')
        .select('minimum_order_amount,restaurant_phone').eq('id', true).single();
      if (requestError) throw requestError;
      const value = readRestaurantSettings(data);
      if (current !== requestNumber.current) return;
      setSettings(value);
      setReady(true);
      setError('');
    } catch {
      if (current === requestNumber.current) setError('Unable to check restaurant settings. Please retry before ordering.');
    } finally {
      if (current === requestNumber.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      requestNumber.current++;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return <RestaurantSettingsContext.Provider value={{ ...settings, loading, ready, error, refresh, applySavedSettings }}>
    {children}
  </RestaurantSettingsContext.Provider>;
}

export function useRestaurantSettings() {
  return useContext(RestaurantSettingsContext);
}
