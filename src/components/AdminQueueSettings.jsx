import {useEffect,useState} from 'react';
import {adminSupabase as supabase} from '../lib/supabase.js';
export default function AdminQueueSettings(){
 const [minutes,setMinutes]=useState(null),[stalled,setStalled]=useState(20),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const {data,error}=await supabase.from('delivery_settings').select('pending_alert_minutes,stalled_alert_minutes').eq('id',true).single();if(error)setMessage('Apply the waiting-order alerts migration, then reload.');else{setMinutes(data.pending_alert_minutes);setStalled(data.stalled_alert_minutes);setMessage('');}}
 useEffect(()=>{load();},[]);
 async function save(e){e.preventDefault();setBusy(true);try{const {error}=await supabase.from('delivery_settings').update({pending_alert_minutes:Number(minutes),stalled_alert_minutes:Number(stalled)}).eq('id',true).select('id').single();if(error)throw error;setMessage('Waiting-order alert time saved.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <section><h2>Waiting-order alerts</h2><p>Show an alert on admin pages when an order has waited this long without a rider. Enable owner notifications below to also receive alerts with the page closed.</p>{message&&<p role="status">{message}</p>}{minutes===null?<button onClick={load}>Reload alert settings</button>:<form onSubmit={save}><label>Alert after (minutes)<input type="number" min="1" max="120" step="1" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><label>Accepted order without progress (minutes)<input type="number" min="5" max="120" required value={stalled} onChange={e=>setStalled(e.target.value)}/></label><button disabled={busy}>Save alert times</button></form>}</section>;
}
