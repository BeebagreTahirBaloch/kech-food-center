import {useEffect,useRef,useState} from 'react';
import {supabase,adminSupabase} from '../lib/supabase.js';
import {readAlertPreference,saveAlertPreference} from '../lib/alertPreferences.js';
const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
let memoryToken;
function browserToken(){
 try{const saved=localStorage.getItem('kfc_push_owner');if(/^[a-f0-9-]{36}$/i.test(saved))return saved;}catch{}
 memoryToken ||= crypto.randomUUID();try{localStorage.setItem('kfc_push_owner',memoryToken);}catch{}return memoryToken;
}
export default function PushAlerts({orderId,owner=false,onEnabledChange,embedded=false}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [checking,setChecking]=useState(true);
 const locked=useRef(false);
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
  let active=true,restoreLock;
  async function restore(){
   if(locked.current)return;
   const token={};restoreLock=token;locked.current=token;
   if(active)setChecking(true);
   try{
    if(!('Notification' in window)||Notification.permission!=='granted'||!('serviceWorker' in navigator)||!('PushManager' in window)){
     if(active)setEnabled(false);return;
    }
    const reg=await registration();let sub=await reg.pushManager.getSubscription();
    if(!active)return;
    const remembered=!owner&&readAlertPreference('kfc_customer_push')===true;
    if(!sub&&remembered){
     const key=import.meta.env.VITE_VAPID_PUBLIC_KEY;
     if(!key)throw Error('Push alerts have not been configured yet.');
     sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(key)});
    }
    if(!active)return;
    let found=sub?await saved(sub,'status'):false;
    if(!active)return;
    // Consent carries forward to new orders, but every order still uses the
    // existing checked registration and browser ownership token on the server.
    if(sub&&!found&&remembered)found=await saved(sub,'save');
    if(!active)return;
    setEnabled(found);
    if(found&&!owner&&readAlertPreference('kfc_customer_push')===null)saveAlertPreference('kfc_customer_push',true);
    setMessage('');
   }catch{if(active)setMessage('Could not restore alerts. Check your connection and try again.');}
   finally{if(locked.current===token)locked.current=false;if(active)setChecking(false);}
  }
  setEnabled(false);restore();
  const visible=()=>{if(!document.hidden)restore();};
  window.addEventListener('online',restore);window.addEventListener('focus',restore);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;if(locked.current===restoreLock)locked.current=false;window.removeEventListener('online',restore);window.removeEventListener('focus',restore);document.removeEventListener('visibilitychange',visible);};
 },[orderId,owner]);
 async function toggle(){
  if(locked.current)return;locked.current=true;
  setBusy(true);setMessage('');try{
   if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Use a browser supporting push. On iPhone, first add this site to your Home Screen.');
   if(enabled){
    const reg=await registration(),sub=await reg.pushManager.getSubscription();
    if(sub)await saved(sub,'remove');
    if(!owner)saveAlertPreference('kfc_customer_push',false);
    setEnabled(false);setMessage(owner?'Alerts off for this owner account.':'Alerts off for this order. Future orders will not enable automatically. Other active orders keep their existing alerts.');return;
   }
   // Permission is requested only in response to this button.
   const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
   if(permission!=='granted')throw Error('Notifications are blocked. You can still follow progress on this page.');
   const reg=await registration();let sub=await reg.pushManager.getSubscription();
   const key=import.meta.env.VITE_VAPID_PUBLIC_KEY;if(!sub&&!key)throw Error('Push alerts have not been configured yet.');
   sub ||= await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(key)});
   const found=await saved(sub,'save');setEnabled(found);
   if(found&&!owner)saveAlertPreference('kfc_customer_push',true);
   setMessage(found?'Alerts on. Your choice is remembered on this browser.':'Alerts were not saved. Please try again.');
  }catch(e){setMessage(e.message);}finally{locked.current=false;setBusy(false);}
 }
 const Heading=embedded?'h3':'h2';
 return <section className={`push-alert-card${embedded?' push-alert-embedded':''}`}><Heading>{owner?'Owner notifications':'Updates when you leave this page'}</Heading>
  <p>{checking?'Checking saved alerts…':typeof Notification!=='undefined'&&Notification.permission==='denied'?'Blocked in browser settings':enabled?'Alerts on':'Alerts off'}</p>
  <button disabled={busy||checking} onClick={toggle}>{busy?'Saving…':enabled?'Turn off alerts':owner?'Enable owner alerts':'Notify me about this order'}</button>
  {!owner&&<p>Enable once to receive updates for this and future orders opened on this browser. You can turn them off here.</p>}
  {owner&&enabled&&<button disabled={busy} onClick={async()=>{try{const {error}=await client.functions.invoke('order-notifications',{body:{action:'test-owner'}});if(error)throw error;setMessage('Test alert sent.');}catch{setMessage('Test failed. Check your notification setup.');}}}>Send test alert</button>}
  {message&&<p role="status">{message}</p>}
  {!('PushManager' in window)&&<p>On iPhone, open this site in Safari, tap Share → Add to Home Screen, then open the installed app to enable alerts.</p>}
  <details><summary>Phone setup and privacy</summary><p>Android: Chrome menu → Add to Home screen → Install, then allow notifications. iPhone: Safari → Share → Add to Home Screen, open the installed app, then enable alerts.</p><p>Notifications contain no customer contact details. You can turn them off here. Customer subscriptions expire after seven days; completed orders receive no further status updates.</p></details>
 </section>;
}
