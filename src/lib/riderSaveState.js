// Reconcile an uncertain action from a fresh server snapshot. Never infer success
// merely because the phone came back online, or automatically replay a mutation.
import {activeOrders} from './riderBatch.js';
export function actionWasSaved(action,data){
 const active=activeOrders(data),id=action.args.order_id,order=active.find(o=>o.id===id)||data.history?.find(o=>o.id===id);
 switch(action.name){
  case 'set_rider_online':return data.profile.online===action.args.p_online;
  case 'accept_order':return active.some(o=>o.id===id);
  case 'accept_orders':return action.args.p_order_ids.every(id=>active.some(o=>o.id===id));
  case 'set_quote':return order&&['confirmed','preparing','out_for_delivery','delivered'].includes(order.status)&&order.eta_minutes===action.args.minutes;
  case 'mark_out_for_delivery':return order&&['out_for_delivery','delivered'].includes(order.status);
  case 'mark_arrived':return Boolean(order?.arrived_at);
  case 'mark_delivered':return order?.status==='delivered';
  case 'rider_cancel_order':return order?.status==='cancelled'&&order.cancelled_by==='rider';
  default:return false;
 }
}
