import { useCallback,useEffect,useRef,useState } from 'react';
import { supabase } from './supabase.js';
export default function useOrder(id) {
 const [order,setOrder]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[notFound,setNotFound]=useState(false);
 const generation=useRef(0);
 const requestNumber=useRef(0);
 const [connected,setConnected]=useState(false);
 const loadOrder=useCallback(async()=>{
  const current=generation.current;
  const request=++requestNumber.current;
  try {
   if(!supabase) throw new Error('Order tracking is unavailable. Please try again later.');
   const {data,error:err}=await supabase.functions.invoke('get-order',{body:{orderId:id}});
   if(current!==generation.current || request!==requestNumber.current) return;
   if(err) { setNotFound(err.context?.status===404); let message=err.message; try { message=(await err.context?.json())?.error || message; } catch {} throw new Error(message); }
   if(!data?.order) throw new Error('Unable to load the order.');
   setOrder(data.order); setNotFound(false); setError('');
  } catch(e) { if(current===generation.current && request===requestNumber.current) setError(e.message); }
  finally { if(current===generation.current && request===requestNumber.current) setLoading(false); }
 },[id]);
 useEffect(()=>{
  generation.current++; let connected=false,active=true,ticks=0;
  setOrder(null);setLoading(true);setNotFound(false);setConnected(false);setError('');loadOrder();
  const channel=supabase?.channel(`order:${id}`,{config:{private:false}})
   .on('broadcast',{event:'order_update'},({payload})=>{if(active && payload?.id===id) loadOrder();})
   .subscribe(status=>{if(!active)return;connected=status==='SUBSCRIBED';setConnected(connected);if(connected) loadOrder();});
  const timer=setInterval(()=>{ticks++;if(!connected || ticks%3===0) loadOrder();},10000);
  const refresh=()=>{if(document.visibilityState==='visible')loadOrder();};
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('online',refresh);
  return ()=>{active=false;generation.current++;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);if(channel) supabase.removeChannel(channel);};
 },[id,loadOrder]);
 return {order,setOrder,error,setError,loading,notFound,loadOrder,connected};
}
