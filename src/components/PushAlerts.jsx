import {useEffect,useState} from 'react';
import {supabase,adminSupabase} from '../lib/supabase.js';
const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
let memoryToken;
function browserToken(){
 try{const saved=localStorage.getItem('kfc_push_owner');if(/^[a-f0-9-]{36}$/i.test(saved))return saved;}catch{}
 memoryToken ||= crypto.randomUUID();try{localStorage.setItem('kfc_push_owner',memoryToken);}catch{}return memoryToken;
}
export default function PushAlerts({orderId,owner=false,onEnabledChange}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{onEnabledChange?.(enabled);},[enabled,onEnabledChange]);
 const client=owner?adminSupabase:supabase;
 async function registration(){return navigator.serviceWorker.register('/notifications-sw.js',{scope:'/'});}
 async function invoke(body){const {data,error}=await supabase.functions.invoke('order-notifications',{body});if(error)throw Error('Unable to save alerts. Check the order and push setup, then try again.');return data;}
 async function saved(sub,action){
  if(owner){
   if(action==='status'){const {data,error}=await client.from('push_subscriptions').select('id').eq('endpoint',sub.endpoint).maybeSingle();if(error)throw error;return Boolean(data);}
   if(action==='remove'){const {error}=await client.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)throw error;return false;}
   const json=sub.toJSON();const {error}=await client.rpc('save_push_subscription',{p_endpoint:sub.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth,p_user_agent:navigator.userAgent});if(error)throw error;return true;
  }
  const json=sub.toJSON();return (await invoke({orderId,action,ownerToken:browserToken(),endpoint:sub.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth})).enabled;
 }
 useEffect(()=>{
  let active=true;const manifest=document.createElement('link');manifest.rel='manifest';manifest.href=owner?'/owner.webmanifest':'/customer.webmanifest';document.head.appendChild(manifest);
  if('serviceWorker' in navigator&&'PushManager' in window)registration().then(async reg=>{const sub=await reg.pushManager.getSubscription();if(sub){const found=await saved(sub,'status');if(active)setEnabled(found);}}).catch(()=>{});
  return()=>{active=false;manifest.remove();};
 },[orderId,owner]);
 async function toggle(){
  setBusy(true);setMessage('');try{
   if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Use a browser supporting push. On iPhone, first add this site to your Home Screen.');
   const key=import.meta.env.VITE_VAPID_PUBLIC_KEY;if(!key)throw Error('Push alerts have not been configured yet.');
   const reg=await registration();let sub=await reg.pushManager.getSubscription();
   if(enabled){if(sub)await saved(sub,'remove');setEnabled(false);setMessage('Alerts off for '+(owner?'this owner account.':'this order.'));return;}
   // Permission is requested only in response to this button.
   if(await Notification.requestPermission()!=='granted')throw Error('Notifications are blocked. You can still follow progress on this page.');
   sub ||= await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(key)});
   setEnabled(await saved(sub,'save'));setMessage('Alerts on. Delivery depends on your device and internet connection.');
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 }
 return <section className="push-alert-card"><h2>{owner?'Owner notifications':'Updates when you leave this page'}</h2>
  <p>{enabled?'Alerts on':typeof Notification!=='undefined'&&Notification.permission==='denied'?'Blocked in browser settings':'Alerts off'}</p>
  <button disabled={busy} onClick={toggle}>{busy?'Saving…':enabled?'Turn off alerts':owner?'Enable owner alerts':'Notify me about this order'}</button>
  {owner&&enabled&&<button disabled={busy} onClick={async()=>{try{const {error}=await client.functions.invoke('order-notifications',{body:{action:'test-owner'}});if(error)throw error;setMessage('Test alert sent.');}catch{setMessage('Test failed. Check your notification setup.');}}}>Send test alert</button>}
  {message&&<p role="status">{message}</p>}
  <details><summary>Phone setup and privacy</summary><p>Android: Chrome menu → Add to Home screen → Install, then allow notifications. iPhone: Safari → Share → Add to Home Screen, open the installed app, then enable alerts.</p><p>Notifications contain no customer contact details. You can turn them off here. Customer subscriptions expire after seven days; completed orders receive no further status updates.</p></details>
 </section>;
}
