import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { defaultWebsiteImages, websiteImageUrl, logoIconPath } from '../lib/websiteImages.js';

const BrandingContext = createContext(null);
const validPath = path => /^website\/logo\/[a-f0-9-]{36}\.webp$/.test(path || '');
function cachedLogo() {
  try { const path = localStorage.getItem('kfc_website_logo'); return validPath(path) ? path : null; }
  catch { return null; }
}
export function BrandingProvider({ children }) {
  const [path, setPath] = useState(cachedLogo);
  const generation = useRef(0);
  const applyLogo = useCallback(value => {
    generation.current++;
    const next = validPath(value) ? value : null;
    setPath(next);
    try { if (next) localStorage.setItem('kfc_website_logo', next); else localStorage.removeItem('kfc_website_logo'); } catch { /* Optional image cache. */ }
  }, []);
  useEffect(() => {
    let active = true, pending;
    async function refresh() {
      pending?.abort();
      const controller = new AbortController(); pending = controller;
      const version = ++generation.current;
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        if (!supabase) return;
        const { data, error } = await supabase.from('website_images').select('image_path').eq('slot', 'logo').maybeSingle().abortSignal(controller.signal);
        if (active && version === generation.current && !error) applyLogo(data?.image_path);
      } catch { /* Keep the last logo, with the bundled logo as an image fallback. */ }
      finally { clearTimeout(timer); }
    }
    const visible = () => { if (!document.hidden) refresh(); };
    refresh();
    const timer = setInterval(visible, 60000);
    window.addEventListener('focus', visible); window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; pending?.abort(); clearInterval(timer); window.removeEventListener('focus', visible); window.removeEventListener('online', visible); document.removeEventListener('visibilitychange', visible); };
  }, [applyLogo]);
  const logoUrl = websiteImageUrl('logo', path);
  const icon192Url = path && supabase ? supabase.storage.from('menu-images').getPublicUrl(logoIconPath(path, 192)).data.publicUrl : '/rider-icon-192.png';
  useEffect(() => {
    const icon = document.querySelector('link[rel="icon"]'), apple = document.querySelector('link[rel="apple-touch-icon"]');
    const image = new Image(); let active = true;
    image.onload = () => { if (active) { icon?.setAttribute('href', icon192Url); apple?.setAttribute('href', icon192Url); } };
    image.onerror = () => { if (active) { icon?.setAttribute('href', '/rider-icon-192.png'); apple?.setAttribute('href', '/rider-icon-192.png'); } };
    image.src = icon192Url;
    return () => { active = false; };
  }, [icon192Url]);
  return <BrandingContext.Provider value={{ logoUrl, icon192Url, custom: Boolean(path), applyLogo }}>{children}</BrandingContext.Provider>;
}
export function useBranding() { return useContext(BrandingContext); }

export function BrandLogo({ square = false, className = '', alt = 'Kech Food Center', ...props }) {
  const branding = useBranding();
  const url = square ? branding.icon192Url : branding.logoUrl;
  const [failed, setFailed] = useState(null);
  const fallback = square ? '/rider-icon-192.png' : defaultWebsiteImages.logo;
  const isFallback = failed === url;
  return <img {...props} className={`${className}${branding.custom && !isFallback ? ' custom-brand-logo' : ''}`}
    src={isFallback ? fallback : url} alt={alt} onError={() => setFailed(url)} />;
}
