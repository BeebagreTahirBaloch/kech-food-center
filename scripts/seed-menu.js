// Local only. Never import this script into the frontend.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { menuSections, getSizes } from '../src/data/menu.js';
const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const root=fileURLToPath(new URL('../',import.meta.url));
function check(result) { if(result.error) throw result.error; return result.data; }
for (const [categoryOrder,category] of menuSections.entries()) {
  const cat=check(await db.from('categories').upsert({name:category.title,sort_order:categoryOrder},{onConflict:'name'}).select().single());
  for(const [sort_order,item] of category.items.entries()) {
    const relative=item.image.replace(/^\.\//,'');
    let bytes;
    try { bytes=await readFile(resolve(root,'public',relative)); } catch { bytes=await readFile(resolve(root,relative)); }
    bytes=await sharp(bytes).rotate().resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    if(bytes.length>2*1024*1024) throw new Error(`Compressed image is still over 2 MB: ${relative}`);
    const path=`seed/${createHash('sha256').update(category.title+'\0'+item.name).digest('hex')}.webp`;
    check(await db.storage.from('menu-images').upload(path,bytes,{contentType:'image/webp',upsert:true}));
    const image_url=db.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
    const sizes=getSizes(item);
    const row=check(await db.from('menu_items').upsert({category_id:cat.id,name:item.name,description:item.desc || '',image_url,base_price:sizes.length ? null : item.price,sort_order},{onConflict:'category_id,name'}).select().single());
    for(const [order,size] of sizes.entries()) check(await db.from('item_sizes').upsert({item_id:row.id,label:size.label,price:size.price,sort_order:order},{onConflict:'item_id,label'}));
    console.log(`Seeded ${category.title}: ${item.name}`);
  }
}
console.log('Menu seed complete. Existing availability and deletion flags were preserved.');
