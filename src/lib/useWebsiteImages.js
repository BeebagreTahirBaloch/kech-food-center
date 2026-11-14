import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { defaultWebsiteImages, websiteImageUrl } from './websiteImages.js';

export function useWebsiteImages() {
  const [images, setImages] = useState(defaultWebsiteImages);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true, pending;
    async function load() {
      pending?.abort();
      const controller = new AbortController(); pending = controller;
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        if (!supabase) return;
        const { data, error } = await supabase.from('website_images').select('slot,image_path').abortSignal(controller.signal);
        if (active && !error && data) setImages(Object.fromEntries(['hero','popup'].map(slot =>
          [slot, websiteImageUrl(slot, data.find(row => row.slot === slot)?.image_path)])));
      } catch { /* Keep the last images, or the original images on first load. */ }
      finally { clearTimeout(timer); if (active && pending === controller) setReady(true); }
    }
    load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    return () => { active = false; pending?.abort(); window.removeEventListener('focus', refresh); };
  }, []);
  return { images, ready };
}
