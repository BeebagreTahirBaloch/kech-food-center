import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
export function safeFile(root,key){
 if(typeof key!=='string'||!key||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid backup object path');
 const resolved=path.resolve(root,key);if(!resolved.startsWith(path.resolve(root)+path.sep))throw Error('Backup path escaped its directory');return resolved;
}
export function requireLocal(url){const parsed=new URL(url);if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('Restore and verification are restricted to local test instances.');return parsed;}
export async function backupImages(client,root){
 const files=[];let count=0;
 async function list(prefix='',depth=0){
  if(depth>15)throw Error('Storage folder nesting is too deep');
  for(let offset=0;;offset+=100){
   const {data,error}=await client.storage.from('menu-images').list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw Error('Could not list menu images');
   for(const item of data){const key=prefix?prefix+'/'+item.name:item.name;
    if(!item.id){await list(key,depth+1);continue;}
    if(++count>10000)throw Error('Too many menu images for one backup');
    const {data:blob,error}=await client.storage.from('menu-images').download(key);if(error)throw Error('Could not download a menu image');
    const bytes=Buffer.from(await blob.arrayBuffer()),dest=safeFile(root,key);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'});
    files.push({key,sha256:checksum(bytes),bytes:bytes.length,contentType:blob.type||'application/octet-stream'});
   }
   if(data.length<100)break;
  }
 }
 await list();return files;
}
export async function tableCounts(client){const counts={};for(const name of ['orders','menu_items','item_sizes','categories','riders','admins','archived_monthly_sales']){
 const {count,error}=await client.from(name).select('*',{count:'exact',head:true});if(error)throw Error('Could not count backup tables');counts[name]=count;
 }return counts;}
export async function verifyBackup(client,directory,manifest){
 const counts=await tableCounts(client);for(const [name,count] of Object.entries(manifest.counts))if(counts[name]!==count)throw Error('Restored table count differs: '+name);
 for(const file of manifest.images){
  if(checksum(await readFile(safeFile(path.join(directory,'menu-images'),file.key)))!==file.sha256)throw Error('Local image checksum mismatch');
  const {data,error}=await client.storage.from('menu-images').download(file.key);if(error||checksum(Buffer.from(await data.arrayBuffer()))!==file.sha256)throw Error('Restored image checksum mismatch');
 }
 return {verifiedAt:new Date().toISOString(),tables:Object.keys(counts).length,images:manifest.images.length};
}
