import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase.js';
export default function useOrderingHours(){
 const [status,setStatus]=useState(null);
 useEffect(()=>{let active=true;async function refresh(){if(!supabase)return;const {data,error}=await supabase.rpc('ordering_status');if(active&&!error)setStatus(data);}refresh();const timer=setInterval(refresh,15000);const focus=()=>refresh();window.addEventListener('focus',focus);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};},[]);
 return status;
}
