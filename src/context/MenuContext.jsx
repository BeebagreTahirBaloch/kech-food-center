import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
const MenuContext = createContext(null);
export function MenuProvider({ children }) {
  const [catalog, setCatalog] = useState([]), [menuSections, setSections] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const hasLoaded = useRef(false);
  const requestId = useRef(0);
  const activeRequest = useRef(null);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    // Once a menu has loaded, refresh it without covering the current page.
    if (!hasLoaded.current) {
      setLoading(true);
      setError('');
    }
    try {
      if (!supabase) throw new Error('The menu is not connected yet. Please try again later.');
      const results = await Promise.all([
        supabase.from('categories').select('*').order('sort_order').order('name').abortSignal(controller.signal),
        supabase.from('menu_items').select('*, item_sizes(*)').eq('is_deleted', false).order('sort_order').order('name').abortSignal(controller.signal)
      ]);
      if (id !== requestId.current) return;
      for (const result of results) if (result.error) throw result.error;
      const sections = results[0].data.map(c => ({ ...c, title: c.name }));
      const items = results[1].data.map(item => ({ ...item, sectionId: item.category_id, image: item.image_url, desc: item.description, price: item.base_price, options: item.base_price === null ? item.item_sizes.sort((a,b) => a.sort_order-b.sort_order) : [] }));
      setSections(sections);
      setCatalog(items);
      hasLoaded.current = true;
      setReady(true); setError('');
    } catch (e) {
      if (id === requestId.current) setError(controller.signal.aborted ? 'The menu took too long to respond. Please try again.' : e.message || 'Unable to load the menu. Please try again.');
    } finally {
      window.clearTimeout(timeout);
      if (id === requestId.current) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      ++requestId.current;
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [refresh]);
  return <MenuContext.Provider value={{ catalog, menuSections, loading, error, ready, refresh }}>{children}</MenuContext.Provider>;
}
export const useMenu = () => useContext(MenuContext);
