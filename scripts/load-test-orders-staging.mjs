// Opt-in real HTTP test. Never run against the production project.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
const production='zsangbpeyefwovceierd';
const url=new URL(process.env.LOAD_TEST_URL||'http://invalid.local');
const ref=process.env.LOAD_TEST_PROJECT_REF;
const count=Number(process.env.LOAD_TEST_COUNT||10);
const duplicate=process.env.LOAD_TEST_MODE==='duplicate';
if(!ref||ref===production||url.hostname!==`${ref}.supabase.co`||url.protocol!=='https:'||url.pathname!=='/functions/v1/create-order'||url.search||url.hash)throw Error('Only an explicitly configured, separate staging Supabase project is allowed. Production is blocked.');
if(process.env.LOAD_TEST_ISOLATED!=='true'||process.env.LOAD_TEST_NOTIFICATIONS_DISABLED!=='true')throw Error('Confirm this is an isolated staging project with Telegram off, no online riders/subscriptions and no live customers. Set both LOAD_TEST_ISOLATED and LOAD_TEST_NOTIFICATIONS_DISABLED to true.');
if(![10,20,100].includes(count))throw Error('Count must be 10, 20 or 100 (hard maximum 100).');
const key=process.env.LOAD_TEST_ANON_KEY||'';
let anon=key.startsWith('sb_publishable_');try{anon ||= JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}
if(!anon)throw Error('Provide only the staging anon/publishable key, never a service-role key.');
const fixture=JSON.parse(await readFile(process.env.LOAD_TEST_FIXTURE||'load-test-fixture.json','utf8'));
if(!fixture.deliveryLocation||!Array.isArray(fixture.items)||!Number.isInteger(fixture.deliveryCharge))throw Error('Fixture needs staging menu items, deliveryLocation and the current deliveryCharge.');
const requestId=randomUUID(),phone=`030${randomInt(10000000,99999999)}`;
const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);const results=[];
try{await Promise.all(Array.from({length:count},async(_,i)=>{const start=performance.now();try{const response=await fetch(url,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({items:fixture.items,deliveryLocation:fixture.deliveryLocation,deliveryCharge:fixture.deliveryCharge,customer:{name:'LOAD TEST ONLY',phone:duplicate?phone:`030${String(10000000+i+randomInt(0,70000000))}`,address:'ISOLATED STAGING TEST - DO NOT DELIVER'},requestId:duplicate?requestId:randomUUID()}),signal:controller.signal});const payload=await response.json();results.push({status:response.status,ms:Math.round(performance.now()-start),orderId:payload.orderId||null});if(response.status>=500)controller.abort();}catch{results.push({status:'network_or_aborted',ms:Math.round(performance.now()-start)});}}));}finally{clearTimeout(timer);}
const times=results.map(r=>r.ms).sort((a,b)=>a-b);const statuses={};for(const r of results)statuses[r.status]=(statuses[r.status]||0)+1;
const report={scope:'Explicitly authorized isolated staging HTTP test',count,mode:duplicate?'duplicate':'distinct',statuses,p95Ms:times[Math.ceil(times.length*.95)-1],uniqueOrders:new Set(results.flatMap(r=>r.orderId?[r.orderId]:[])).size};
await mkdir('.test-results',{recursive:true});await writeFile('.test-results/order-staging-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(duplicate&&report.uniqueOrders>1)throw Error('Duplicate-order protection failed');
if(results.some(r=>typeof r.status!=='number'||r.status>=500))process.exitCode=1;
