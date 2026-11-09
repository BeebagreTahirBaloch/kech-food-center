import {isTelegramEnabled,telegram} from './telegram.ts';
import {validPushEndpoint,sendPush} from './push.ts';
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
function assert(value:unknown){if(!value)throw Error('Assertion failed');}
Deno.test('Telegram default-off and exact true; disabled calls do not touch network',async()=>{
 const previous=Deno.env.get('TELEGRAM_ENABLED'),fetchOriginal=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=(()=>{calls++;throw Error('Unexpected network');}) as typeof fetch;
  for(const value of [undefined,'false','TRUE','1',' true ']){if(value===undefined)Deno.env.delete('TELEGRAM_ENABLED');else Deno.env.set('TELEGRAM_ENABLED',value);assert(!isTelegramEnabled());await telegram('sendMessage',{});}
  assert(calls===0);Deno.env.set('TELEGRAM_ENABLED','true');assert(isTelegramEnabled());
 }finally{globalThis.fetch=fetchOriginal;if(previous===undefined)Deno.env.delete('TELEGRAM_ENABLED');else Deno.env.set('TELEGRAM_ENABLED',previous);}
});
Deno.test('Push provider restrictions and encrypted notification request',async()=>{
 for(const url of ['http://fcm.googleapis.com/send','https://localhost/send','https://fcm.googleapis.com.attacker.test/send','https://user@fcm.googleapis.com/send','https://fcm.googleapis.com:444/send'])assert(!validPushEndpoint(url));
 assert(validPushEndpoint('https://fcm.googleapis.com/fcm/send/test'));
 const previous=new Map(['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'].map(k=>[k,Deno.env.get(k)]));const original=globalThis.fetch;
 try{
  const vapid=webpush.generateVAPIDKeys();Deno.env.set('VAPID_PUBLIC_KEY',vapid.publicKey);Deno.env.set('VAPID_PRIVATE_KEY',vapid.privateKey);Deno.env.set('VAPID_SUBJECT','mailto:test@example.com');
  const keys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const raw=await crypto.subtle.exportKey('raw',keys.publicKey);
  const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  let called=false;
  globalThis.fetch=async(_url,options)=>{called=true;const h=new Headers(options?.headers);assert(h.get('TTL')==='120');assert(h.get('Urgency')==='high');assert(h.get('Content-Encoding')==='aes128gcm');assert(options?.redirect==='error');return new Response(null,{status:201});};
  await sendPush({id:'test',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:base64(new Uint8Array(raw)),auth:base64(crypto.getRandomValues(new Uint8Array(16)))},{title:'New delivery order',body:'Open the app',url:'/rider'});
  assert(called);
 }finally{globalThis.fetch=original;for(const [key,value] of previous){if(value===undefined)Deno.env.delete(key);else Deno.env.set(key,value);}}
});
