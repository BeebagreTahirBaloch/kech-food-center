// All fetches are intercepted. No live provider, customer data or orders are used.
function assert(ok: unknown, message = 'Assertion failed') { if (!ok) throw Error(message); }

Deno.test({name: 'estimate-delivery: shared routing, charge, fallback, safe errors and preflight', sanitizeOps:false, sanitizeResources:false, fn:async()=>{
  const oldFetch=globalThis.fetch, oldServe=Deno.serve;
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENROUTESERVICE_API_KEY','RESTAURANT_LAT','RESTAURANT_LNG','ALLOWED_ORIGIN'];
  const saved=Object.fromEntries(names.map(name=>[name,Deno.env.get(name)]));
  Deno.env.set('SUPABASE_URL','http://localhost:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','local-test-only');
  Deno.env.set('OPENROUTESERVICE_API_KEY','routing-test-only');
  Deno.env.set('RESTAURANT_LAT','26');Deno.env.set('RESTAURANT_LNG','63');
  Deno.env.delete('ALLOWED_ORIGIN');
  let handler:(r:Request)=>Promise<Response>, mode='ok', lastDistance=-1, calls=0;
  const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  Deno.serve=((h:unknown)=>{handler=h as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
  globalThis.fetch=(async(input:RequestInfo|URL, init?:RequestInit)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.hostname==='localhost'){
      if(url.pathname.endsWith('/check_delivery_request'))return response({allowed:true});
      if(url.pathname.endsWith('/restaurant_settings'))return response({delivery_radius_km:15});
      if(url.pathname.endsWith('/reserve_delivery_route'))return response(true);
    }
    if(url.hostname==='api.heigit.org'&&url.pathname==='/openrouteservice/v2/directions/driving-car/json'){
      calls++;
      assert(new Headers(init?.headers).get('Authorization')==='routing-test-only');
      const body=JSON.parse(String(init?.body));
      assert(JSON.stringify(body.coordinates)==='[[63,26],[63.01,26.01]]');
      if(mode==='quota')return response({error:'private provider response'},429);
      if(mode==='auth')return response({error:'private provider response'},403);
      if(mode==='no-route')return response({error:'private provider response'},404);
      return response({routes:[{summary:{distance:4900}}]});
    }
    if(url.hostname==='localhost'&&url.pathname.endsWith('/delivery_charge_for_distance')){
      lastDistance=JSON.parse(String(init?.body)).km;
      return response(lastDistance<=5?100:150);
    }
    throw Error('Unexpected network attempt blocked');
  }) as typeof fetch;
  try {
    await import('./index.ts');
    const request=(deliveryLocation:unknown={lat:26.01,lng:63.01})=>new Request('http://localhost/estimate-delivery',{method:'POST',body:JSON.stringify({deliveryLocation})});
    let r=await handler!(request()), body=await r.json();
    assert(r.status===200&&body.distanceKm===4.9&&body.deliveryCharge===100&&body.distanceMethod==='openrouteservice');
    assert(lastDistance===4.9&&calls===1);
    r=await handler!(request({googleMapsUrl:'https://www.google.com/maps?query=26.01,63.01'}));
    assert(r.status===200&&(await r.json()).distanceKm===4.9);
    mode='quota';r=await handler!(request());body=await r.json();
    assert(r.status===200&&body.distanceMethod==='haversine'&&Number.isFinite(body.distanceKm));
    assert(body.distanceKm===lastDistance);
    mode='auth';r=await handler!(request());body=await r.json();
    assert(r.status===503&&body.error.includes('not configured'));
    assert(!JSON.stringify(body).includes('private provider')&&!JSON.stringify(body).includes('routing-test-only'));
    mode='no-route';r=await handler!(request());assert(r.status===400&&(await r.json()).error.includes('check your delivery pin'));
    Deno.env.delete('OPENROUTESERVICE_API_KEY');const before=calls;
    r=await handler!(request());assert(r.status===503&&calls===before);
    r=await handler!(new Request('http://localhost/estimate-delivery',{method:'OPTIONS'}));assert(r.status===204&&await r.text()==='');
  } finally {
    globalThis.fetch=oldFetch;Deno.serve=oldServe;
    for(const name of names){if(saved[name]===undefined)Deno.env.delete(name);else Deno.env.set(name,saved[name]!);}
  }
}});
