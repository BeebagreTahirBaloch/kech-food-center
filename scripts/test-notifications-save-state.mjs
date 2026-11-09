import assert from 'node:assert/strict';
import {notificationPayload,shouldSendNotification} from '../supabase/functions/_shared/notificationPayload.js';
import {actionWasSaved} from '../src/lib/riderSaveState.js';
const order={id:'11111111-1111-4111-8111-111111111111',status:'confirmed',rider_id:'rider',progress_at:'2026-11-07T10:00:00Z',customer_name:'Private name',phone:'03000000000',address:'Private address'};
for(const audience of ['customer','owner']){
 const payload=notificationPayload({id:'job',audience,event:'accepted'},order);
 for(const privateValue of ['Private name','03000000000','Private address'])assert.equal(JSON.stringify(payload).includes(privateValue),false);
 assert.ok(payload.url.startsWith(audience==='owner'?'/admin/':'/track/'));
}
assert.equal(shouldSendNotification({audience:'customer',event:'accepted'},order),false);
assert.equal(shouldSendNotification({audience:'customer',event:'delivered'},{...order,status:'cancelled'}),false);
assert.equal(shouldSendNotification({audience:'customer',event:'on_way'},{...order,status:'out_for_delivery'}),true);
assert.equal(shouldSendNotification({audience:'owner',event:'stalled',progress_at:'2026-11-07T09:00:00Z'},order),false);
assert.equal(shouldSendNotification({audience:'owner',event:'stalled',progress_at:order.progress_at},order),true);
const action={name:'mark_delivered',args:{order_id:order.id}};
assert.equal(actionWasSaved(action,{active:{...order,status:'out_for_delivery'},history:[]}),false);
assert.equal(actionWasSaved(action,{active:null,history:[{...order,status:'delivered'}]}),true);
assert.equal(actionWasSaved(action,{active:null,history:[{...order,id:'other',status:'delivered'}]}),false);
assert.equal(actionWasSaved({name:'accept_order',args:{order_id:order.id}},{active:{id:'other'},history:[]}),false);
assert.equal(actionWasSaved({name:'accept_orders',args:{p_order_ids:['a','b']}},{activeOrders:[{id:'a'},{id:'b'}]}),true);
assert.equal(actionWasSaved({name:'accept_orders',args:{p_order_ids:['a','b']}},{activeOrders:[{id:'a'}]}),false);
assert.equal(actionWasSaved(action,{activeOrders:[{...order,id:'another',status:'out_for_delivery'}],history:[{...order,status:'delivered'}]}),true);
console.log('PASS notification privacy, obsolete-event suppression, and uncertain rider-save reconciliation');
