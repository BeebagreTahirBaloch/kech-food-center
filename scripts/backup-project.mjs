// Local-only administrative tool. Never import from the frontend.
import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile,stat,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {backupImages,tableCounts,checksum} from './lib/backup-tools.mjs';
export async function run(program,args,env=process.env){
 await new Promise((resolve,reject)=>{const child=spawn(program,args,{env,stdio:'ignore',windowsHide:true});child.once('error',()=>reject(Error('Required backup tool is unavailable')));child.once('exit',code=>code===0?resolve():reject(Error('Database command failed. Check CLI login, link, Docker and database access.')));});
}
async function main(){
 const url=process.env.BACKUP_SUPABASE_URL,key=process.env.BACKUP_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Set BACKUP_SUPABASE_URL and BACKUP_SERVICE_ROLE_KEY in a private local environment.');
 const ref=(await readFile('supabase/.temp/project-ref','utf8')).trim();if(new URL(url).hostname!==ref+'.supabase.co')throw Error('Linked CLI project does not match BACKUP_SUPABASE_URL');
 const root=path.resolve(process.env.BACKUP_DIRECTORY||path.join('..','kech-food-center-private-backups'));if(root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw Error('Keep backups outside the served website directory.');
 const folder=path.join(root,new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(folder,{recursive:true});
 const cli=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npx-cli.js');await access(cli);
 for(const [name,flags] of [['roles.sql',['--role-only']],['database-schema.sql',[]],['data.sql',['--data-only','--use-copy','-x','storage.buckets_vectors','-x','storage.vector_indexes']]]){
  await run(process.execPath,[cli,'--no-install','supabase','db','dump','--linked','--file',path.join(folder,name),...flags]);
  if(!(await stat(path.join(folder,name))).size)throw Error('Database dump is empty');
 }
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const counts=await tableCounts(client),images=await backupImages(client,path.join(folder,'menu-images'));
 const dumps={};for(const name of ['roles.sql','database-schema.sql','data.sql'])dumps[name]=checksum(await readFile(path.join(folder,name)));
 await writeFile(path.join(folder,'manifest.json'),JSON.stringify({version:1,sourceHost:new URL(url).hostname,createdAt:new Date().toISOString(),counts,images,dumps},null,2));
 await writeFile(path.join(folder,'COMPLETE'),'Database dumps and menu images downloaded. Restore verification is still required.');
 console.log('Backup completed in '+folder+'. Keep it private and run the local restore check.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(()=>{console.error('Backup failed. Check prerequisites and private environment settings. No COMPLETE marker is written on failure.');process.exitCode=1;});
