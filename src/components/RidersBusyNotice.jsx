import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase.js';
export default function RidersBusyNotice({orderPlaced=false}){
 const [busy,setBusy]=useState(false),[none,setNone]=useState(false);
 useEffect(()=>{let active=true;async function load(){if(!supabase)return;try{const {data,error}=await supabase.rpc('rider_availability');if(active&&!error){setBusy(data?.allBusy===true);setNone(data?.noneOnline===true);}}catch{}}load();const timer=setInterval(load,15000);window.addEventListener('focus',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);};},[]);
 return busy||none?<div className="delivery-charge-note ordering-hours-notice" role="status"><span>{none?'No riders are online right now. Your order may wait longer for a rider.':'All riders are busy. Your order may take longer.'}{!orderPlaced&&' You can still place your order.'}</span></div>:null;
}
