import {createClient} from '@supabase/supabase-js';
import {readFile,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {run} from './backup-project.mjs';
import {checksum,requireLocal,safeFile,verifyBackup} from './lib/backup-tools.mjs';
async function main(){
 if(process.env.CONFIRM_LOCAL_RESTORE!=='RESTORE_EMPTY_LOCAL_TEST')throw Error('Confirm a new, empty local test instance first.');
 const dir=path.resolve(process.argv[2]||''),dbUrl=requireLocal(process.env.RESTORE_DATABASE_URL),apiUrl=requireLocal(process.env.RESTORE_SUPABASE_URL);
 if(!process.env.RESTORE_SERVICE_ROLE_KEY)throw Error('Local test service key required');
 await access(path.join(dir,'COMPLETE'));const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
 for(const [name,hash] of Object.entries(manifest.dumps)){if(!['roles.sql','database-schema.sql','data.sql'].includes(name)||checksum(await readFile(path.join(dir,name)))!==hash)throw Error('Database dump checksum mismatch');}
 const env={...process.env,PGHOST:dbUrl.hostname,PGPORT:dbUrl.port||'5432',PGUSER:decodeURIComponent(dbUrl.username),PGPASSWORD:decodeURIComponent(dbUrl.password),PGDATABASE:dbUrl.pathname.slice(1),PGSSLMODE:'disable'};
 await run('psql',['--no-psqlrc','--set','ON_ERROR_STOP=1','--command',"DO $$ BEGIN IF to_regclass('public.orders') IS NOT NULL THEN RAISE EXCEPTION 'Use a fresh empty local test stack'; END IF; END $$;"],env);
 await run('psql',['--no-psqlrc','--single-transaction','--set','ON_ERROR_STOP=1','--file',path.join(dir,'roles.sql'),'--file',path.join(dir,'database-schema.sql'),'--command','SET session_replication_role = replica','--file',path.join(dir,'data.sql'),'--command','SET session_replication_role = origin'],env);
 await run('psql',['--no-psqlrc','--command',"NOTIFY pgrst, 'reload schema'"],env);
 const client=createClient(apiUrl.href,process.env.RESTORE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const file of manifest.images){const bytes=await readFile(safeFile(path.join(dir,'menu-images'),file.key));if(checksum(bytes)!==file.sha256)throw Error('Image checksum mismatch');const {error}=await client.storage.from('menu-images').upload(file.key,bytes,{contentType:file.contentType,upsert:true});if(error)throw Error('Could not restore a menu image');}
 const result=await verifyBackup(client,dir,manifest);await writeFile(path.join(dir,'restore-verification.json'),JSON.stringify(result,null,2));
 console.log('Local restore verified: table counts and image checksums match. Run the documented application smoke test next.');
}
main().catch(()=>{console.error('Local restore was not verified. Check the backup, a fresh local stack, PostgreSQL tools and local credentials. Never target production.');process.exitCode=1;});
