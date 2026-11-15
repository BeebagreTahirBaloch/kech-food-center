// Public branding only. Never reads orders, auth sessions or server credentials.
export async function serveBrandIcon(request, response, env = process.env, fetcher = fetch) {
  if (!['GET','HEAD'].includes(request.method)) {
    response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD'); response.end(); return;
  }
  const size = new URL(request.url, 'https://local.invalid').searchParams.get('size') === '512' ? 512 : 192;
  let target = `/rider-icon-${size}.png`, updated = false;
  try {
    const base = new URL(env.VITE_SUPABASE_URL);
    const key = env.VITE_SUPABASE_ANON_KEY;
    if (base.protocol !== 'https:' || !key) throw Error('Branding unavailable');
    const result = await fetcher(new URL('/rest/v1/website_images?select=image_path&slot=eq.logo&limit=1', base), {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    if (!result.ok) { await result.body?.cancel(); throw Error('Branding unavailable'); }
    const path = (await result.json())?.[0]?.image_path;
    if (/^website\/logo\/[a-f0-9-]{36}\.webp$/.test(path || '')) {
      target = new URL(`/storage/v1/object/public/menu-images/${path.replace(/\.webp$/, `-${size}.png`)}`, base).href;
      updated = true;
    }
  } catch { /* Missing migration/network configuration uses the bundled icon. */ }
  response.statusCode = 302;
  response.setHeader('Cache-Control', `public, max-age=${updated ? 60 : 15}, s-maxage=${updated ? 60 : 15}`);
  response.setHeader('Location', target);
  response.end();
}
