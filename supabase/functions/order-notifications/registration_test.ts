// No live push, database or authentication requests.
function assert(value:unknown){if(!value)throw Error('Assertion failed');}
Deno.test({name:'customer alerts: single-order registration, private capability, SSRF rejection and empty preflight',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
 const fetchBefore=globalThis.fetch,serveBefore=Deno.serve;
 const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ALLOWED_ORIGIN'];const saved=Object.fromEntries(names.map(n=>[n,Deno.env.get(n)]));
 Deno.env.set('SUPABASE_URL','http://localhost:54321');Deno.env.set('SUPABASE_ANON_KEY','test-anon');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-service');Deno.env.delete('ALLOWED_ORIGIN');
 let handler:(r:Request)=>Promise<Response>;let calls=0;
 Deno.serve=((fn:unknown)=>{handler=fn as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.hostname!=='localhost')throw Error('External request blocked');
  if(url.pathname.endsWith('/customer_push_registration')){calls++;const args=JSON.parse(String(init?.body));assert(args.p_owner_hash.length===64);assert(!JSON.stringify(args).includes('ownerToken'));return new Response('true',{headers:{'content-type':'application/json'}});}
  if(url.pathname.endsWith('/user'))return new Response('{"error":"Not authorized"}',{status:401,headers:{'content-type':'application/json'}});
  throw Error('Unexpected endpoint');
 }) as typeof fetch;
 try{
  await import('./index.ts');
  const body={orderId:'11111111-1111-4111-8111-111111111111',ownerToken:'22222222-2222-4222-8222-222222222222',action:'save',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'a'.repeat(87),auth:'b'.repeat(22)};
  const req=(data:unknown)=>new Request('http://localhost/order-notifications',{method:'POST',body:JSON.stringify(data)});
  let r=await handler!(req(body));assert(r.status===200);assert(JSON.stringify(await r.json())==='{"enabled":true}');assert(calls===1);
  r=await handler!(req({...body,endpoint:'https://127.0.0.1/private'}));assert(r.status===400&&calls===1);
  r=await handler!(req({...body,orderId:'not-uuid'}));assert(r.status===400&&calls===1);
  r=await handler!(req({action:'test-owner'}));assert(r.status===400);
  r=await handler!(new Request('http://localhost/order-notifications',{method:'OPTIONS'}));assert(r.status===204&&await r.text()==='');
 }finally{globalThis.fetch=fetchBefore;Deno.serve=serveBefore;for(const n of names){if(saved[n]===undefined)Deno.env.delete(n);else Deno.env.set(n,saved[n]!);}}
}});
