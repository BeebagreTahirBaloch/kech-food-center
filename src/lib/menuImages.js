import { adminSupabase as supabase } from './supabase.js';
export async function prepareImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size>2*1024*1024) throw new Error('Image must be 2 MB or smaller.');
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));
    if(!blob || blob.size>2*1024*1024) throw new Error('Unable to compress this image below 2 MB.');
    return blob;
  } finally { bitmap.close(); }
}
export function imagePath(url) {
  const prefix=supabase.storage.from('menu-images').getPublicUrl('').data.publicUrl;
  return url?.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}
