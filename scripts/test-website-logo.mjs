import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { serveBrandIcon } from '../server/brandIcon.js';
const path = 'website/logo/11111111-1111-4111-8111-111111111111.webp';
const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role; create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin',true)='yes' $$;");
  await db.exec(await readFile('supabase/migrations/202611130001_website_images.sql', 'utf8'));
  const sql = await readFile('supabase/migrations/202611150001_website_logo.sql', 'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.exec('set role anon');
  assert.equal((await db.query('select * from website_images')).rows.length, 3);
  await assert.rejects(db.exec('update website_images set image_path=null'), { code: '42501' });
  await db.exec("reset role; set role authenticated; select set_config('test.admin','no',false)");
  assert.equal((await db.query("update website_images set image_path=$1 where slot='logo' returning slot", [path])).rows.length, 0);
  await db.exec("select set_config('test.admin','yes',false)");
  await db.query("update website_images set image_path=$1 where slot='logo'", [path]);
  for (const invalid of ['https://evil.test/logo.webp', '../logo.webp', path.replace('/logo/', '/hero/')]) {
    await assert.rejects(db.query("update website_images set image_path=$1 where slot='logo'", [invalid]), { code: '23514' });
  }
  await assert.rejects(db.exec('delete from website_images'), { code: '42501' });
  assert.equal((await db.query("update website_images set image_path=null where slot='logo' and image_path is null returning slot")).rows.length, 0);
  await db.exec('reset role'); await db.exec(sql);
  assert.equal((await db.query("select image_path from website_images where slot='logo'")).rows[0].image_path, path);
} finally { await db.close(); }
const env = { VITE_SUPABASE_URL: 'https://branding.example.test', VITE_SUPABASE_ANON_KEY: 'public-test-only' };
let calls = 0;
async function request(method = 'GET', url = '/api/brand-icon?size=192', value = path, offline = false) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end() {} };
  await serveBrandIcon({ method, url }, response, env, async (url, options) => {
    calls++; assert.equal(url.hostname, 'branding.example.test'); assert.equal(url.searchParams.get('slot'), 'eq.logo');
    assert.equal(options.headers.apikey, 'public-test-only');
    if (offline) throw Error('offline');
    return new Response(JSON.stringify([{ image_path: value }]), { headers: { 'Content-Type': 'application/json' } });
  });
  return response;
}
for (const size of [192,512]) {
  const response = await request('GET', '/api/brand-icon?size=' + size);
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.Location, 'https://branding.example.test/storage/v1/object/public/menu-images/' + path.replace('.webp', `-${size}.png`));
}
assert.equal((await request('HEAD')).statusCode, 302);
assert.equal((await request('GET', '/api/brand-icon?size=999', '../unsafe')).headers.Location, '/rider-icon-192.png');
assert.equal((await request('GET', '/api/brand-icon?size=512', null, true)).headers.Location, '/rider-icon-512.png');
const before = calls; assert.equal((await request('POST')).statusCode, 405); assert.equal(calls, before);
console.log('PASS: logo migration reruns, public/admin privileges, safe paths, stale-save guard, icon sizes and safe API fallbacks');
