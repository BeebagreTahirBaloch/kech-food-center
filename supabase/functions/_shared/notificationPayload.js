export function notificationPayload(job, order) {
 const owner=job.audience==='owner';
 const titles=owner?{new:'New food order',waiting:'Order waiting for a rider',stalled:'Order needs attention'}:
  {accepted:'Your rider accepted your order',confirmed:'Your rider accepted and set your delivery time',eta:'Your arrival estimate was updated',on_way:'Your order is on the way',arrived:'Your rider has arrived',delivered:'Your order was delivered. Enjoy your meal!',cancelled:'Your order was cancelled'};
 return {title:titles[job.event] || 'Order update',body:owner?'Open the owner page to check this order.':'Open your tracking page for the latest details.',
  tag:`${job.audience}-${job.id}`,renotify:true,url:owner?`/admin/orders?order=${order.id}`:`/track/${order.id}`};
}
export function shouldSendNotification(job,order) {
 if(!order)return false;
 if(job.audience==='customer'){
  const states={accepted:['awaiting_charge'],confirmed:['confirmed','preparing'],eta:['confirmed','preparing','out_for_delivery'],on_way:['out_for_delivery'],arrived:['out_for_delivery'],delivered:['delivered'],cancelled:['cancelled','declined']};
  return (states[job.event]||[]).includes(order.status);
 }
 if(job.event==='new')return !['delivered','cancelled','declined'].includes(order.status);
 if(new Date(job.progress_at).getTime()!==new Date(order.progress_at).getTime())return false;
 return job.event==='waiting'?order.status==='pending'&&!order.rider_id:!['pending','delivered','cancelled','declined'].includes(order.status);
}
