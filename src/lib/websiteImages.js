import { supabase } from './supabase.js';

export const defaultWebsiteImages = {
  hero: '/images/kfc hero section image.png',
  popup: '/images/kech food center advest.png',
};
export function websiteImageUrl(slot, path) {
  if (!supabase || !new RegExp(`^website/${slot}/[a-f0-9-]{36}\\.webp$`).test(path || '')) return defaultWebsiteImages[slot];
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}
export function fallbackWebsiteImage(event, slot) {
  if (event.currentTarget.getAttribute('src') !== defaultWebsiteImages[slot]) event.currentTarget.src = defaultWebsiteImages[slot];
}
