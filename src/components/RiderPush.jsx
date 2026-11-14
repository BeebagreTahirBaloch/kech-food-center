import {useEffect,useState} from 'react';
import {riderSupabase as supabase} from '../lib/supabase.js';
import {rpc,edge} from '../lib/riderApi.js';
const keyBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
export default function RiderPush(){
 const [registration,setRegistration]=useState(null),[install,setInstall]=useState(null),[enabled,setEnabled]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const blocked=typeof Notification!=='undefined' && Notification.permission==='denied';
 useEffect(()=>{
  let active=true;
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/rider-sw.js',{scope:'/rider'}).then(async reg=>{if(active){setRegistration(reg);const sub=await reg.pushManager?.getSubscription();if(sub){const {data,error}=await supabase.from('push_subscriptions').select('id').eq('endpoint',sub.endpoint).maybeSingle();if(active)setEnabled(!error&&Boolean(data));}}}).catch(()=>{if(active)setMessage('Installable alerts are unavailable on this browser.');});
  const prompt=e=>{e.preventDefault();setInstall(e);};window.addEventListener('beforeinstallprompt',prompt);
  return ()=>{active=false;window.removeEventListener('beforeinstallprompt',prompt);};
 },[]);
 async function enable(){setBusy(true);try{
  if(!registration || !('PushManager' in window) || !('Notification' in window))throw Error('Install the app on your home screen or use a browser supporting push.');
  if(await Notification.requestPermission()!=='granted')throw Error('Blocked in browser settings');
  const key=import.meta.env.VITE_VAPID_PUBLIC_KEY;if(!key)throw Error('Order alerts have not been configured yet.');
  const sub=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});
  const json=sub.toJSON();await rpc('save_push_subscription',{p_endpoint:sub.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth,p_user_agent:navigator.userAgent});setEnabled(true);setMessage('Alerts on');
 }catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function disable(){setBusy(true);try{const sub=await registration?.pushManager.getSubscription();if(sub){const {error}=await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)throw error;await sub.unsubscribe();}setEnabled(false);setMessage('Alerts off');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <section><h2>Order alerts</h2><p>{blocked?'Blocked in browser settings':enabled?'Alerts on':'Alerts off'}</p><div className="rider-actions"><button disabled={busy} onClick={enable}>Turn on order alerts</button>{enabled&&<><button disabled={busy} onClick={disable}>Turn off alerts</button><button onClick={()=>edge('rider-push',{}).then(()=>setMessage('Test alert sent')).catch(e=>setMessage(e.message))}>Send test alert</button></>}{install&&<button onClick={async()=>{await install.prompt();setInstall(null);}}>Install app</button>}</div>{message&&<p role="status">{message}</p>}<p>Android: open in Chrome, tap the three-dot menu → Add to Home screen → Install (or tap Install app if shown). Open the installed app, tap Turn on order alerts, and choose Allow.</p><p>iPhone: open in Safari, tap Share → Add to Home Screen, then open the installed app to turn on alerts.</p><details><summary>If alerts are late</summary><p>Android: allow notifications, set battery usage to No restrictions, enable Autostart if available, and lock the app in recent apps. Keep your phone connected to the internet.</p><p>iPhone: use the Home Screen app, allow notifications in Settings, and check Focus and Low Power Mode. Delivery timing depends on your phone and network.</p><p>Alerts contain no customer details. Turn them off here before sharing this device.</p></details></section>;
}
