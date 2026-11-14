import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const sql = await readFile('supabase/migrations/202611130001_website_images.sql','utf8');
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin',true)='yes' $$;`);
  await db.exec(sql); await db.exec(sql);
  await db.exec('set role anon');
  assert.equal((await db.query('select * from website_images')).rows.length,2);
  await assert.rejects(db.exec("update website_images set image_path=null"),{code:'42501'});
  await db.exec("reset role; set role authenticated; select set_config('test.admin','no',false)");
  assert.equal((await db.query('update website_images set image_path=null returning slot')).rows.length,0);
  await db.exec("select set_config('test.admin','yes',false)");
  for(const command of ["delete from website_images","insert into website_images(slot) values('other')","update website_images set slot='popup' where slot='hero'"]) await assert.rejects(db.exec(command),{code:'42501'});
  for(const path of ['https://evil.test/a.webp','website/popup/11111111-1111-4111-8111-111111111111.webp','../a.webp']) await assert.rejects(db.query("update website_images set image_path=$1 where slot='hero'",[path]),{code:'23514'});
  const path='website/hero/11111111-1111-4111-8111-111111111111.webp';
  await db.query("update website_images set image_path=$1 where slot='hero'",[path]);
  assert.equal((await db.query("update website_images set image_path=null where slot='hero' and image_path is null returning slot")).rows.length,0,'Stale saves cannot overwrite newer images');
  await db.exec('reset role'); await db.exec(sql);
  assert.equal((await db.query("select image_path from website_images where slot='hero'")).rows[0].image_path,path);
  console.log('PASS: public reads, admin-only image updates, path constraints, stale-save guard and safe migration reruns');
} finally { await db.close(); }
