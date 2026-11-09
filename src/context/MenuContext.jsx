import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
const MenuContext = createContext(null);
export function MenuProvider({ children }) {
  const [catalog, setCatalog] = useState([]), [menuSections, setSections] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      if (!supabase) throw new Error('The menu is not connected yet. Please try again later.');
      const results = await Promise.all([supabase.from('categories').select('*').order('sort_order').order('name'), supabase.from('menu_items').select('*, item_sizes(*)').eq('is_deleted', false).order('sort_order').order('name')]);
      for (const result of results) if (result.error) throw result.error;
      setSections(results[0].data.map(c => ({ ...c, title: c.name })));
      setCatalog(results[1].data.map(item => ({ ...item, sectionId: item.category_id, image: item.image_url, desc: item.description, price: item.base_price, options: item.base_price === null ? item.item_sizes.sort((a,b) => a.sort_order-b.sort_order) : [] })));
      setReady(true); setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); const timer=setInterval(() => { if (!document.hidden) refresh(); },30000); window.addEventListener('focus',refresh); return () => { clearInterval(timer); window.removeEventListener('focus',refresh); }; }, [refresh]);
  return <MenuContext.Provider value={{ catalog, menuSections, loading, error, ready, refresh }}>{children}</MenuContext.Provider>;
}
export const useMenu = () => useContext(MenuContext);
