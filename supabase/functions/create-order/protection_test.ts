// All network and serving are intercepted: never sends a real order or notification.
import {phoneHash} from '../_shared/orderProtection.ts';
function assert(ok:unknown,message='Assertion failed'){if(!ok)throw Error(message);}
Deno.test({name:'create-order protection integration: replay/rate limit skip work, guarded checkout saves once',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
 const oldFetch=globalThis.fetch,oldServe=Deno.serve;
 const envNames=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TELEGRAM_ENABLED','ALLOWED_ORIGIN','RESTAURANT_LAT','RESTAURANT_LNG','OPENROUTESERVICE_API_KEY'];
 const saved=Object.fromEntries(envNames.map(k=>[k,Deno.env.get(k)]));
 Deno.env.set('SUPABASE_URL','http://localhost:54321');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','local-test-only');Deno.env.set('TELEGRAM_ENABLED','false');Deno.env.set('RESTAURANT_LAT','26');Deno.env.set('RESTAURANT_LNG','63');
 Deno.env.set('OPENROUTESERVICE_API_KEY','fake-ors-test-key');
 let handler:(r:Request)=>Promise<Response>;let mode='accepted',routes=0,inserts=0,claims=0;let savedOrder:Record<string,unknown>|null=null;
 const insertPayloads:Record<string,unknown>[]=[],rateDistances:number[]=[];
 const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 Deno.serve=((h:unknown)=>{handler=h as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);const method=init?.method||'GET';
  if(url.hostname==='api.heigit.org'&&url.pathname==='/openrouteservice/v2/directions/driving-car/json'){routes++;return response({routes:[{summary:{distance:2000}}]});}
  if(url.hostname!=='localhost')throw Error('Unexpected network attempt blocked');
  const path=url.pathname;
  if(path.endsWith('/begin_order_request'))return response(mode==='rate_limited'?{status:mode,retryAfter:60}:mode==='in_progress'?{status:mode,retryAfter:3}:mode==='conflict'?{status:mode}:savedOrder?{status:'replay',orderId:savedOrder.id,createdAt:savedOrder.created_at,subtotal:500}:{status:'accepted',leaseId:'11111111-1111-4111-8111-111111111111'});
  if(path.endsWith('/release_order_request'))return response(null);
  if(path.endsWith('/price_menu_cart'))return response([{name:'Test food',unitPrice:500,lineTotal:500,quantity:1}]);
  if(path.endsWith('/delivery_charge_for_distance')){rateDistances.push(JSON.parse(String(init?.body)).km);return response(100);}
  if(path.endsWith('/claim_push_jobs')){claims++;return response([]);}
  if(path.endsWith('/orders')&&method==='POST'){inserts++;insertPayloads.push(JSON.parse(String(init?.body)));savedOrder={id:'22222222-2222-4222-8222-222222222222',created_at:'2026-11-03T12:00:00Z'};return response(savedOrder,201);}
  if(path.endsWith('/orders')&&method==='PATCH')return response(null);
  throw Error('Unexpected local endpoint');
 }) as typeof fetch;
 try{
  await import('./index.ts');
  const body={requestId:'33333333-3333-4333-8333-333333333333',customer:{name:'Test customer',phone:'03000000000',address:'Test address'},deliveryLocation:{lat:26,lng:63},deliveryCharge:100,items:[{itemId:'44444444-4444-4444-8444-444444444444',sizeId:null,quantity:1}]};
  // Restaurant coordinates are read by the production distance function.
  const request=()=>new Request('http://localhost/create-order',{method:'POST',body:JSON.stringify(body)});
  mode='rate_limited';let r=await handler!(request());assert(r.status===429);assert(r.headers.get('Retry-After')==='60');assert(routes===0&&inserts===0);
  mode='in_progress';r=await handler!(request());assert(r.status===409&&routes===0);
  mode='conflict';r=await handler!(request());assert(r.status===409&&inserts===0);
  // Replay does not depend on current prices, location service or notification availability.
  savedOrder={id:'22222222-2222-4222-8222-222222222222',created_at:'2026-11-03T12:00:00Z'};mode='accepted';r=await handler!(request());assert(r.status===200);assert((await r.json()).replayed===true);assert(routes===0&&inserts===0&&claims===0);
  // Server rejects a different delivery price; no order or notification is created.
  savedOrder=null;body.deliveryCharge=150;r=await handler!(request());assert(r.status===409);assert((await r.json()).code==='DELIVERY_RATE_CHANGED');assert(inserts===0&&routes===1&&claims===0);
  body.deliveryCharge=100;
  r=await handler!(new Request('http://localhost/create-order',{method:'POST',body:JSON.stringify({...body,reviewedSubtotal:400})}));assert(r.status===409);assert((await r.json()).code==='MENU_PRICE_CHANGED');assert(inserts===0&&routes===1&&claims===0,'Changed menu price must stop before routing or insertion');
  r=await handler!(request());assert(r.status===200);const created=await r.json();assert(inserts===1&&routes===2&&claims===1);
  assert(rateDistances.length===2&&rateDistances.every(km=>km===2),'Rates must use the server ORS distance');
  assert(insertPayloads[0].distance_km===2&&insertPayloads[0].delivery_charge===100&&insertPayloads[0].total===600,'Order snapshot must use server distance and prices');
  r=await handler!(request());const retried=await r.json();assert(retried.orderId===created.orderId&&retried.replayed===true);assert(inserts===1&&routes===2&&claims===1);
  r=await handler!(new Request('http://localhost/create-order',{method:'OPTIONS'}));assert(r.status===204&&await r.text()==='');
  assert((await phoneHash('03000000000','local-test-only')).length===64);
 }finally{globalThis.fetch=oldFetch;Deno.serve=oldServe;for(const k of envNames){if(saved[k]===undefined)Deno.env.delete(k);else Deno.env.set(k,saved[k]!);}}
}});
