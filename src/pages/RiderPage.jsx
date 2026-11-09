import {useEffect,useState,useRef,useCallback} from 'react';
import {riderSupabase as supabase} from '../lib/supabase.js';
import {rpc,edge,money,date} from '../lib/riderApi.js';
import RiderPush from '../components/RiderPush.jsx';
import ReviseEta from '../components/ReviseEta.jsx';
import {activeOrders,batchProblem,dropDistance,assignmentMessages} from '../lib/riderBatch.js';
import {actionWasSaved} from '../lib/riderSaveState.js';
import '../admin.css';
import '../rider.css';
const map=o=>`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
const items=o=><ul>{(o.items||[]).map((i,n)=><li key={n}>{i.quantity} × {i.name}{i.optionLabel&&` · ${i.optionLabel}`}</li>)}</ul>;
export default function RiderPage(){
 const [session,setSession]=useState(null),[allowed,setAllowed]=useState(false),[checking,setChecking]=useState(true),[message,setMessage]=useState('');
 useEffect(()=>{if(!supabase){setChecking(false);return;}let active=true;supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setChecking(false);}});const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);});return()=>{active=false;data.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(!session){setAllowed(false);setChecking(false);return;}let active=true;rpc('is_rider').then(async ok=>{if(!active)return;if(ok){setAllowed(true);}else{setMessage('Not authorized');await supabase.auth.signOut({scope:"local"});}}).catch(()=>{if(active)setMessage('Not authorized');}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[session]);
 async function login(e){e.preventDefault();const f=new FormData(e.currentTarget);setMessage('');const {error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)setMessage('Unable to sign in. Check your email and password.');}
 if(checking)return <main className="admin-page">Checking access...</main>;
 if(!allowed)return <main className="admin-page admin-login"><h1>KFC Turbat Rider</h1>{message&&<p role="alert">{message}</p>}{supabase?<form onSubmit={login}><label>Email<input type="email" name="email" autoComplete="username" required/></label><label>Password<input type="password" name="password" autoComplete="current-password" required/></label><button>Sign in</button></form>:<p>Supabase is not configured.</p>}</main>;
 return <RiderDashboard/>;
}
function RiderDashboard(){
 const [data,setData]=useState(null),[tab,setTab]=useState('new'),[historyPage,setHistoryPage]=useState(0),[connected,setConnected]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[sound,setSound]=useState(false),[now,setNow]=useState(Date.now()),[showCancel,setShowCancel]=useState(false),[reason,setReason]=useState('no_answer'),[note,setNote]=useState(''),[eta,setEta]=useState(30);
 const [selected,setSelected]=useState([]),[selectedActive,setSelectedActive]=useState(null);
 const active=activeOrders(data),limit=data?.maxActiveOrders??1,radius=Number(data?.nearbyOrderKm??1);
 const o=active.find(x=>x.id===selectedActive)||active[0];
 useEffect(()=>{setShowCancel(false);setReason('no_answer');setNote('');setEta(30);},[o?.id]);
 useEffect(()=>{setSelected(ids=>ids.filter(id=>data?.pending?.some(x=>x.id===id)));},[data?.pending]);
 const audio=useRef(null),seen=useRef(new Set()),generation=useRef(0),uncertain=useRef(null),actionLock=useRef(false);
 const [online,setOnline]=useState(navigator.onLine),[lastSync,setLastSync]=useState(null),[saveState,setSaveState]=useState('No changes waiting to be saved.'),[syncFailed,setSyncFailed]=useState(false);
 const tone=()=>{try{const a=audio.current;if(a?.state!=='running')return;const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.05,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.25);o.start();o.stop(a.currentTime+.3);}catch{}};
 const load=useCallback(async()=>{const token=++generation.current;try{const next=await rpc('rider_dashboard',{history_page:historyPage});if(token!==generation.current)return;const added=next.pending.filter(o=>!seen.current.has(o.id));next.pending.forEach(o=>seen.current.add(o.id));if(added.length && next.profile.online){tone();try{navigator.vibrate?.([120,60,120]);}catch{}}setData(next);setLastSync(Date.now());setSyncFailed(false);if(uncertain.current){setSaveState(actionWasSaved(uncertain.current,next)?'Saved — confirmed after reconnecting.':'Refreshed from the server. The last change was not confirmed; review the current order before trying again.');uncertain.current=null;}return true;}catch(e){if(token!==generation.current)return false;setSyncFailed(true);if(e.code==='42501'){setData(null);await supabase.auth.signOut({scope:"local"});}else setMessage('Could not refresh orders. Reconnect and refresh before making changes.');return false;}},[historyPage]);
 useEffect(()=>{const update=()=>{setOnline(navigator.onLine);if(navigator.onLine)load();};window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[load]);
 useEffect(()=>{let live=true;load();const timer=setInterval(load,10000);const tick=setInterval(()=>setNow(Date.now()),1000);const channel=supabase.channel('rider-orders',{config:{private:true}}).on('broadcast',{event:'changed'},load).subscribe(s=>{if(live){setConnected(s==='SUBSCRIBED');if(s==='SUBSCRIBED')load();}});const refresh=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',refresh);return()=>{live=false;generation.current++;clearInterval(timer);clearInterval(tick);document.removeEventListener('visibilitychange',refresh);supabase.removeChannel(channel);};},[load]);
 useEffect(()=>{let lock,active=true;const acquire=async()=>{if(active && data?.profile.online && !document.hidden && navigator.wakeLock){try{lock=await navigator.wakeLock.request('screen');if(!active)await lock.release();}catch{}}};acquire();document.addEventListener('visibilitychange',acquire);return()=>{active=false;lock?.release();document.removeEventListener('visibilitychange',acquire);};},[data?.profile.online]);
 useEffect(()=>()=>{audio.current?.close().catch(()=>{});},[]);
 async function action(name,args,success){
  if(actionLock.current)return;
  if(!navigator.onLine||syncFailed){setSaveState('Reconnect and refresh the order before making changes.');return;}
  actionLock.current=true;setBusy(true);setSaveState('Saving to the server…');
  try{const response=await rpc(name,args),result=response?.status??response;const errors=assignmentMessages;
   if(errors[result]||(result&&!['accepted','updated','cancelled'].includes(result))){setMessage(errors[result]||result);setSaveState('Change was not applied. Refresh and check the current order.');}
   else{setSaveState('Saved — server confirmed.');setMessage(success||'Updated');if(result==='accepted'){setTab('active');setSelectedActive(args.order_id||args.p_order_ids?.[0]);setSelected([]);setShowCancel(false);setReason('no_answer');setNote('');}}
   await load();
  }catch{uncertain.current={name,args};setSaveState('Save not confirmed. Do not repeat the action yet. Reconnect and refresh to check the server.');await load();}
  finally{actionLock.current=false;setBusy(false);}
 }
 async function signOut(){try{await rpc('set_rider_online',{p_online:false});const reg=await navigator.serviceWorker?.getRegistration('/rider');const sub=await reg?.pushManager?.getSubscription();if(sub){await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe();}}catch{}await supabase.auth.signOut({scope:"local"});}
 if(!data)return <main className="admin-page"><p>{message || 'Loading rider orders...'}</p><button onClick={load}>Retry</button><button onClick={signOut}>Sign out</button></main>;
 const waitEnd=o?.arrived_at?Math.max(Date.parse(o.arrived_at),Date.parse(o.customer_here_at)||0)+data.wait_minutes*60000:null;
 const remaining=waitEnd?Math.max(0,Math.ceil((waitEnd-now)/1000)):null;
 return <main className="admin-page rider-page"><header className="admin-heading"><div><h1>{data.profile.name}</h1><p>{!online?'Offline':connected?'Connected':'Reconnecting...'}</p></div><button onClick={signOut}>Sign out</button></header>
 <aside className="rider-save-state" aria-live="polite"><p>Last successful update: {lastSync?new Date(lastSync).toLocaleTimeString('en-PK'):'Not yet connected'}</p><p>{saveState}</p>{syncFailed&&<p>The displayed order may be out of date.</p>}<button disabled={busy||!online} onClick={load}>Refresh and check saved state</button></aside>
 <section><label className="rider-online"><input type="checkbox" checked={data.profile.online} disabled={busy||!online||syncFailed} onChange={e=>action('set_rider_online',{p_online:e.target.checked})}/> {data.profile.online?'Online':'Offline'}</label><button onClick={async()=>{try{const A=window.AudioContext||window.webkitAudioContext;if(A){audio.current ||= new A();await audio.current.resume();setSound(true);tone();}}catch{setMessage('Sound is unavailable.');}}}>{sound?'Sound enabled':'Enable sound'}</button><p>Keep Online to receive new-order push alerts. Screen stays awake when supported while this page is visible.</p></section>
 <div className="rider-tabs">{[['new','New orders'],['active',`My active orders (${active.length})`],['history','History']].map(([value,label])=><button aria-pressed={tab===value} key={value} onClick={()=>setTab(value)}>{label}</button>)}</div>
 {message&&<p className="admin-toast" role="status">{message}<button onClick={()=>setMessage('')}>Close</button></p>}
 {tab==='new'&&<>
 <p>{active.length} of {limit} active orders. Nearby delivery limit: {radius} km between pins.</p>
 {active.length>=limit&&<p role="status">Your order limit is reached. Complete a delivery to accept another.</p>}
 {active.some(x=>x.arrived_at)&&<p>Finish the delivery where you have already arrived before adding another stop.</p>}
 <p>Select nearby orders to accept together. Check each map: roads may be longer than the distance between pins.</p>
 {selected.length>0&&<div className="rider-batch-bar"><strong>{selected.length} selected</strong><button disabled={busy||!online||syncFailed||Boolean(batchProblem(active,data.pending.filter(x=>selected.includes(x.id)),limit,radius))} onClick={()=>action('accept_orders',{p_order_ids:selected},'Selected orders accepted. Set a delivery time for each.')}>Accept selected ({selected.length})</button><button disabled={busy} onClick={()=>setSelected([])}>Clear selection</button></div>}
 {!data.pending.length&&<section>No new orders</section>}{data.pending.map(order=>{
 const problem=batchProblem(active,[order],limit,radius);
 const choices=data.pending.filter(x=>selected.includes(x.id));
 const selectionProblem=batchProblem(active,[...choices.filter(x=>x.id!==order.id),order],limit,radius);
 const otherStops=[...active,...choices.filter(x=>x.id!==order.id)],separation=otherStops.length?Math.max(...otherStops.map(x=>dropDistance(x,order))):null;
 return <section key={order.id}><h2>Order {order.id.slice(0,8)}</h2>
 <label className="rider-select-order"><input type="checkbox" checked={selected.includes(order.id)} disabled={busy||!online||syncFailed||(!selected.includes(order.id)&&Boolean(selectionProblem))} onChange={e=>setSelected(ids=>e.target.checked?[...ids,order.id]:ids.filter(id=>id!==order.id))}/> Select order {order.id.slice(0,8)}</label>
 <div className="rider-delivery-address"><strong>Delivery address</strong><p>{order.address || 'Address unavailable'}</p></div>{items(order)}<p>Subtotal: {money(order.subtotal)} · Distance: {order.distance_km} km</p><p>Delivery charge: {money(order.estimated_delivery_charge)}</p>
 {separation!==null&&Number.isFinite(separation)&&<p>{separation<=radius?'Nearby delivery':'Outside nearby limit'} · up to {separation.toFixed(1)} km from the other delivery pins (straight-line).</p>}
 {problem&&<p>{problem}</p>}<div className="rider-actions"><a href={map(order)} target="_blank" rel="noreferrer">Map</a><button disabled={busy||!online||syncFailed||Boolean(problem)} onClick={()=>action('accept_order',{order_id:order.id},'Order accepted')}>Accept</button></div></section>;})}</>}
 {tab==='active'&&active.length>0&&<section className="rider-active-list"><h2>Active deliveries ({active.length})</h2>{active.length>1&&<p>Review the route and update each customer's arrival time if another stop causes a delay.</p>}{active.map(order=><button type="button" key={order.id} disabled={busy} aria-pressed={o?.id===order.id} onClick={()=>setSelectedActive(order.id)}><strong>Order {order.id.slice(0,8)}</strong><span>{order.status.replaceAll('_',' ')} · {money(order.total??order.subtotal)}</span><span>{order.address}</span></button>)}</section>}
 {tab==='active'&&(!o?<section>Ready for the next order</section>:<section><h2>Order {o.id.slice(0,8)}</h2><p>{o.status.replaceAll('_',' ')}</p><h3>{o.customer_name}</h3><p>{o.address}</p><p>{o.phone}</p>{items(o)}<p>Subtotal {money(o.subtotal)} · Delivery {o.delivery_charge==null?'Not set':money(o.delivery_charge)} · Total {money(o.total??o.subtotal)}</p><div className="rider-actions"><a href={map(o)} target="_blank" rel="noreferrer">Navigate</a><a href={`tel:${o.phone}`} onClick={()=>{rpc('log_call_attempt',{order_id:o.id}).then(load).catch(()=>setMessage('Call could not be recorded. Please try again before cancelling.'));}}>Call customer</a></div>
 <p>{o.arrival_eta_at&&`Updated arrival: ${new Date(o.arrival_eta_at).toLocaleTimeString('en-PK')}`}</p>
 {['confirmed','preparing','out_for_delivery'].includes(o.status)&&<ReviseEta key={o.id} orderId={o.id} client={supabase} onSaved={load} onSaveState={setSaveState}/>}
 {o.status==='awaiting_charge'&&<><p>Delivery charge: {money(o.delivery_charge??o.estimated_delivery_charge)} · Set by the restaurant</p><label>Estimated time<select value={eta} onChange={e=>setEta(Number(e.target.value))}>{[30,60,120].map(n=><option value={n} key={n}>{n} minutes</option>)}</select></label><button disabled={busy||!online||syncFailed} onClick={()=>action('set_quote',{order_id:o.id,charge:0,minutes:eta},'Order confirmed')}>Set delivery time</button></>}
 {['confirmed','preparing'].includes(o.status)&&<button disabled={busy||!online||syncFailed} onClick={()=>action('mark_out_for_delivery',{order_id:o.id},'Out for delivery')}>Out for delivery</button>}
 {o.status==='out_for_delivery'&&<><div className="rider-actions"><button disabled={busy||!online||syncFailed||Boolean(o.arrived_at)} onClick={()=>action('mark_arrived',{order_id:o.id},'Arrival recorded')}>I've arrived</button><button disabled={busy||!online||syncFailed} onClick={()=>{if(window.confirm(`Mark order ${o.id.slice(0,8)} delivered?`))action('mark_delivered',{order_id:o.id},'This order was delivered. Review your remaining deliveries.');}}>Delivered</button></div>{remaining!=null&&<p>Wait time: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}{o.customer_here_at&&' · Customer said “I’m here”; wait restarted'}</p>}</>}
 <div className="rider-cancel-area"><button type="button" className="rider-cancel-toggle" disabled={busy||!online||syncFailed} onClick={()=>setShowCancel(value=>!value)}>{showCancel?'Keep this order':'Cancel order'}</button>
 {showCancel&&<form onSubmit={e=>{e.preventDefault();if(window.confirm(`Cancel order ${o.id.slice(0,8)}? Your other deliveries will stay active.`))action('rider_cancel_order',{order_id:o.id,reason,note},'This order was cancelled. Your other deliveries stay active.');}}><h3>Cancel this order</h3><label>Reason<select value={reason} onChange={e=>setReason(e.target.value)}>{[['no_answer','Customer not answering'],['wrong_address','Wrong address'],['customer_refused','Customer refused the order'],['other','Other reason']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Note {reason==='other'?'(required)':'(optional)'}<textarea value={note} onChange={e=>setNote(e.target.value)} required={reason==='other'} maxLength={500}/></label>
 {reason==='no_answer'&&!o.call_count&&<p>Tap Call customer first to record a call attempt.</p>}
 {reason==='no_answer'&&remaining>0&&<p>Arrival wait remaining: {Math.ceil(remaining/60)} minutes.</p>}
 <button disabled={busy||!online||syncFailed||(reason==='no_answer'&&(!o.call_count||(remaining!=null&&remaining>0)))||(reason==='other'&&!note.trim())}>Confirm cancellation</button></form>}
 </div>
 </section>)}
 {tab==='history'&&<><section><h2>Today's delivered orders: {data.today.delivered}</h2><p>Delivery charges {money(data.today.charges)} · Sales {money(data.today.sales)}</p></section>{data.history.map(h=><section key={h.id}><strong>{h.id.slice(0,8)} · {h.status}</strong><p>{date(h.delivered_at || h.cancelled_at)}</p>{items(h)}<p>{money(h.total??h.subtotal)}</p></section>)}<div className="rider-actions"><button disabled={historyPage===0} onClick={()=>setHistoryPage(n=>n-1)}>Previous</button><button disabled={data.history.length<25} onClick={()=>setHistoryPage(n=>n+1)}>Next</button></div></>}
 <RiderPush/>
 </main>;
}
