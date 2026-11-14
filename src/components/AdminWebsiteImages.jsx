import { useCallback, useEffect, useRef, useState } from 'react';
import { adminSupabase } from '../lib/supabase.js';
import { prepareImage } from '../lib/menuImages.js';
import { fallbackWebsiteImage, websiteImageUrl } from '../lib/websiteImages.js';

function ImageEditor({ row, onSaved, onBusy }) {
  const [blob, setBlob] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const input = useRef(null);
  const title = row.slot === 'hero' ? 'Homepage hero image' : 'Welcome popup image';
  useEffect(() => { onBusy(row.slot, busy); }, [busy, row.slot, onBusy]);
  useEffect(() => {
    if (!blob) { setPreview(''); return; }
    const url = URL.createObjectURL(blob); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  async function choose(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setMessage(''); setBlob(null);
    try { setBlob(await prepareImage(file)); }
    catch (e) { setError(e.message || 'Unable to open this image. Try another JPG, PNG or WebP.'); input.current.value = ''; }
    finally { setBusy(false); }
  }
  async function save() {
    if (!blob || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const bucket = adminSupabase.storage.from('menu-images');
      const path = `website/${row.slot}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await bucket.upload(path, blob, { contentType: 'image/webp', upsert: false });
      if (uploadError) throw Error('Upload failed. Check your admin access and connection, then try again.');
      let query = adminSupabase.from('website_images').update({ image_path: path }).eq('slot', row.slot);
      query = row.image_path == null ? query.is('image_path', null) : query.eq('image_path', row.image_path);
      const { data, error: saveError } = await query.select('slot,image_path').maybeSingle();
      // Do not delete an uploaded image on an uncertain response: the save may have committed.
      if (saveError || !data) throw Error('Could not confirm the save, or another admin changed this image. Reload the images before trying again.');
      onSaved(data); setBlob(null); input.current.value = '';
      setMessage(`${title} saved. Customers will see it when they open or return to the homepage.`);
      if (row.image_path) {
        try {
          const { error: cleanupError } = await bucket.remove([row.image_path]);
          if (cleanupError) throw cleanupError;
        } catch { setMessage(`${title} saved. The old file could not be removed from storage.`); }
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <article className="website-image-editor" aria-label={title}>
    <h3>{title}</h3>
    <p>{row.slot === 'hero' ? 'Use a wide landscape image for the banner above the menu.' : 'Shown in the welcome deal popup. A portrait or square image works well.'}</p>
    <div className="website-image-preview"><img src={preview || websiteImageUrl(row.slot, row.image_path)} alt={preview ? `${title} preview` : `Current ${title.toLowerCase()}`} onError={e => fallbackWebsiteImage(e, row.slot)} /></div>
    <label>Choose {row.slot === 'hero' ? 'hero' : 'popup'} image<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={choose} /></label>
    <small>JPG, PNG or WebP, up to 2 MB. Images are resized before upload.</small>
    {preview && <p className="website-image-unsaved">Preview only — click Save to publish this image.</p>}
    {error && <p className="restaurant-settings-error" role="alert">{error}</p>}
    {message && <p className="restaurant-settings-success" role="status">{message}</p>}
    <button type="button" onClick={save} disabled={busy || !blob}>{busy ? 'Please wait…' : `Save ${row.slot} image`}</button>
  </article>;
}

export default function AdminWebsiteImages() {
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [working, setWorking] = useState({});
  const onBusy = useCallback((slot, busy) => setWorking(previous => ({ ...previous, [slot]: busy })), []);
  async function load() {
    setLoading(true); setError('');
    try {
      const { data, error: failed } = await adminSupabase.from('website_images').select('slot,image_path');
      if (failed || !['hero','popup'].every(slot => data?.some(row => row.slot === slot))) throw Error('Unable to load website images. Apply the website-images SQL migration, then retry.');
      setRows(data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return <section className="admin-website-images" aria-labelledby="website-images-title">
    <h2 id="website-images-title">Website images</h2><p>Upload and preview each image, then save it to update the website.</p>
    {error && <p role="alert" className="restaurant-settings-error">{error}</p>}
    {loading ? <p role="status">Loading website images…</p> : !error && rows && <div className="website-images-grid">{['hero','popup'].map(slot =>
      <ImageEditor key={slot} row={rows.find(row => row.slot === slot)} onBusy={onBusy} onSaved={saved => setRows(previous => previous.map(row => row.slot === saved.slot ? saved : row))} />)}</div>}
    {!loading && <button type="button" className="website-images-reload" disabled={Object.values(working).some(Boolean)} onClick={load}>Reload images</button>}
  </section>;
}
