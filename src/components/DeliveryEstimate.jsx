import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase.js';
export default function DeliveryEstimate({mode,location,mapsUrl,onEstimateChange,refreshKey=0}){
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [rates,setRates]=useState(null);
 useEffect(()=>{let active=true;supabase?.from('delivery_rates').select('tiers').eq('id',true).single().then(({data,error})=>{if(active&&!error)setRates(data.tiers);});return()=>{active=false;};},[]);
 const key=mode==='pin'?JSON.stringify(location):mapsUrl.trim();
 useEffect(()=>{let active=true;setResult(null);setError('');setLoading(Boolean(key&&key!=='null'));if(!key||key==='null')return;
 const timer=setTimeout(async()=>{try{const {data,error}=await supabase.functions.invoke('estimate-delivery',{body:{deliveryLocation:mode==='pin'?JSON.parse(key):{googleMapsUrl:key}}});if(error){let message='Could not calculate delivery. Check your location and try again.';try{const body=await error.context?.clone()?.json();if(typeof body?.error==='string')message=body.error;}catch{}throw Error(message);}if(!Number.isInteger(data?.deliveryCharge))throw Error('Could not calculate delivery. Please try again.');if(active)setResult({key,mode,charge:data.deliveryCharge,distanceKm:data.distanceKm,distanceMethod:data.distanceMethod});}catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}},500);return()=>{active=false;clearTimeout(timer);};},[mode,key,retry,refreshKey]);
 const current=result?.key===key&&result?.mode===mode?result:null;
 const charge=current?.charge??null;
 useEffect(()=>{onEstimateChange?.({mode,key,charge});},[mode,key,charge,onEstimateChange]);
 return <div className="delivery-estimate-panel" aria-live="polite"><h3>Delivery charge</h3>{loading?<p className="delivery-estimate-help">Calculating delivery charge…</p>:charge!=null?<><div className="price-row"><span>Distance-based delivery</span><strong>Rs. {charge.toLocaleString('en-PK')}</strong></div>
 {Number.isFinite(current.distanceKm)&&<p className="delivery-estimate-help">{current.distanceMethod==='haversine'?'Approximate distance':'Road distance'}: {current.distanceKm.toFixed(1)} km</p>}
 {current.distanceMethod==='haversine'&&<p className="delivery-estimate-help">Road routing is temporarily unavailable. This distance uses a straight-line estimate.</p>}
 {current.distanceMethod==='openrouteservice'&&<p className="delivery-routing-credit">© <a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">openrouteservice by HeiGIT</a> · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>}
 </>:<p className="delivery-estimate-help">{error||'Choose a delivery location to calculate your delivery charge.'}</p>}{!loading&&key&&key!=='null'&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Refresh delivery charge</button>}{charge==null&&rates&&<ul className="delivery-tier-cards">{rates.map((band,i)=><li key={i}><span>{band.maxKm===null?(i===0?'All distances':`Over ${rates[i-1].maxKm} km`):`${i===0?'0':`Over ${rates[i-1].maxKm}`}–${band.maxKm} km`}</span><strong>Rs. {band.charge}</strong></li>)}</ul>}<p className="delivery-estimate-disclaimer">Delivery rates are set by the restaurant. Your charge is fixed when you place the order.</p></div>;
}
