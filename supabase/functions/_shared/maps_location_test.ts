import {parseGoogleMapsUrl,parseDeliveryLocation} from './orders.ts';
function same(actual:unknown,expected:unknown){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(JSON.stringify({actual,expected}));}
async function rejects(url:string){let rejected=false;try{await parseGoogleMapsUrl(url);}catch{rejected=true;}if(!rejected)throw Error('Ambiguous/invalid URL accepted');}
Deno.test('Explicit destination and selected place outrank the map camera',async()=>{
 same(await parseGoogleMapsUrl('https://www.google.com/maps/dir/@24.88,67.0,12z?api=1&destination=26,63'),{lat:26,lng:63});
 same(await parseGoogleMapsUrl('https://www.google.com/maps/place/Test/@24.88,67,12z/data=!3d26.1!4d63.2!16sTest'),{lat:26.1,lng:63.2});
 for(const key of ['q','query','daddr'])same(await parseGoogleMapsUrl(`https://maps.google.com/maps?${key}=-26.1,63.2&ll=24,67`),{lat:-26.1,lng:63.2});
 same(await parseDeliveryLocation({lat:26,lng:63}),{lat:26,lng:63});
});
Deno.test('Ambiguous cameras, names, multi-stop routes and malformed coordinates require a pin',async()=>{
 for(const url of ['https://www.google.com/maps/@24,67,12z','https://maps.google.com/?ll=24,67','https://www.google.com/maps/dir/@24,67?destination=Some+place&q=25,66','https://www.google.com/maps/dir/A/B/data=!3d24!4d67!3d26!4d63','https://maps.google.com/?q=126,63','https://maps.google.com/?q=Street+26,63','https://maps.google.com/?query=26,263','https://evil.test/?q=26,63'])await rejects(url);
});
Deno.test('Short links resolve selected coordinates and reject insecure redirects',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try{
 globalThis.fetch=(async()=>{calls++;return calls===1?new Response(null,{status:302,headers:{location:'https://www.google.com/maps/place/Test/@24,67/data=!3d26!4d63'}}):new Response('');}) as typeof fetch;
 same(await parseGoogleMapsUrl('https://maps.app.goo.gl/test'),{lat:26,lng:63});
 globalThis.fetch=(async()=>new Response(null,{status:302,headers:{location:'http://www.google.com/maps?q=26,63'}})) as typeof fetch;
 await rejects('https://maps.app.goo.gl/test');
 }finally{globalThis.fetch=previous;}
});
