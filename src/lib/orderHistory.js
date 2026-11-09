const KEY = 'kfc_my_orders';
export function readOrders() {
  try {
    const data=JSON.parse(localStorage.getItem(KEY) || '[]');
    if(!Array.isArray(data)) return [];
    return data.filter(x=>typeof x.id==='string' && /^[0-9a-f-]{36}$/i.test(x.id) && Number.isFinite(Date.parse(x.time)) && Number.isFinite(x.subtotal))
      .map(({id,time,subtotal})=>({id,time,subtotal})).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,20);
  } catch { return []; }
}
export function saveOrder(id,subtotal,time=new Date().toISOString()) {
  try { localStorage.setItem(KEY,JSON.stringify([{id,time,subtotal},...readOrders().filter(x=>x.id!==id)].slice(0,20))); } catch { /* Private browsing can disable storage. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kfc-orders-changed'));
}
export function removeSavedOrder(id) {
  const next=readOrders().filter(x=>x.id!==id);
  try { localStorage.setItem(KEY,JSON.stringify(next)); } catch { /* Optional storage. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kfc-orders-changed'));
  return next;
}
export function countdown(order,now=Date.now()) {
  if(order?.arrivedAt || order?.arrived_at)return null;
  if(!order || !['confirmed','preparing','out_for_delivery'].includes(order.status)) return null;
  const start=Date.parse(order.confirmedAt ?? order.confirmed_at);
  const eta=Number(order.etaMinutes ?? order.eta_minutes);
  if(!Number.isFinite(start) || !Number.isFinite(eta) || eta<=0) return null;
  const revised=Date.parse(order.arrivalEtaAt ?? order.arrival_eta_at);
  const seconds=Math.max(0,Math.ceil(((Number.isFinite(revised)?revised:start+eta*60000)-now)/1000));
  return seconds===0 ? 'Taking longer than estimated' : `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
