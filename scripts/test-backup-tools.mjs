import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {backupImages,verifyBackup,requireLocal,safeFile} from './lib/backup-tools.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'kfc-backup-test-'));
try{
 const imagesRoot=path.join(dir,'menu-images'),image=new Blob(['fixture-image'],{type:'image/webp'});let corrupted=false;
 const client={
  from:()=>({select:async()=>({count:2,error:null})}),
  storage:{from:()=>({
   list:async(prefix)=>({data:prefix?[{id:'file',name:'food.webp'}]:[{id:null,name:'nested'}],error:null}),
   download:async()=>({data:corrupted?new Blob(['changed']):image,error:null})
  })}
 };
 const images=await backupImages(client,imagesRoot);assert.equal(images.length,1);assert.equal(images[0].key,'nested/food.webp');assert.equal((await readFile(path.join(imagesRoot,'nested/food.webp'))).toString(),'fixture-image');
 const manifest={counts:{orders:2},images};assert.equal((await verifyBackup(client,dir,manifest)).images,1);
 corrupted=true;await assert.rejects(verifyBackup(client,dir,manifest),/checksum/);corrupted=false;
 await assert.rejects(verifyBackup(client,dir,{...manifest,counts:{orders:3}}),/count/);
 assert.throws(()=>safeFile(imagesRoot,'../secret'));assert.throws(()=>safeFile(imagesRoot,'x/../../secret'));assert.throws(()=>requireLocal('https://zsangbpeyefwovceierd.supabase.co'));
 assert.equal(requireLocal('http://127.0.0.1:54321').hostname,'127.0.0.1');
 await writeFile(path.join(imagesRoot,'nested/food.webp'),'bad');await assert.rejects(verifyBackup(client,dir,manifest),/checksum/);
 console.log('PASS backup image traversal, checksums, count verification, corruption detection and local-only restore guards');
}finally{assert.equal(path.dirname(dir),path.resolve(tmpdir()));assert.ok(path.basename(dir).startsWith('kfc-backup-test-'));await rm(dir,{recursive:true,force:true});}
