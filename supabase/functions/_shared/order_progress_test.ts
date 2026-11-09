import { escapeHtml,riderOrderMessage,outForDeliveryKeyboard,orderKeyboard,quoteKeyboard,etaKeyboard,deliveredKeyboard,cancelKeyboard } from './telegram.ts';
import { publicOrder } from './orders.ts';
Deno.test('Rider messages escape user text and keep both action buttons',()=>{
 const message=riderOrderMessage({id:'order-id',customer_name:'<b>A&B</b>',phone:'1234567',address:'<address>',items:[{name:'Pizza & <size>',quantity:2,optionLabel:'<large>',lineTotal:1000}],subtotal:1000,distance_km:2},'New order',100);
 if(!message.includes('&lt;b&gt;A&amp;B&lt;/b&gt;') || !message.includes('<code>order-id</code>') || message.includes('<address>')) throw new Error('Unsafe rider message');
 if(escapeHtml('<>&')!=='&lt;&gt;&amp;') throw new Error('Escaping failed');
 if(outForDeliveryKeyboard('id').inline_keyboard[0].length!==2) throw new Error('Missing rider action');
});
Deno.test('Public order excludes customer fields and includes progress timestamps',()=>{
 const safe=publicOrder({id:'id',customer_name:'Private',phone:'123',address:'Private',confirmed_at:'2026-10-31T00:00:00Z',delivered_at:null});
 if('phone' in safe || 'customer_name' in safe || 'address' in safe || safe.confirmedAt!=='2026-10-31T00:00:00Z') throw new Error('Unsafe tracking payload');
});
Deno.test('All active rider keyboards have cancel and quoting offers free delivery',()=>{
 for (const keyboard of [orderKeyboard('id','https://maps.google.com'),quoteKeyboard('id'),etaKeyboard('id'),outForDeliveryKeyboard('id'),deliveredKeyboard('id'),cancelKeyboard('id')]) {
   if(!keyboard.inline_keyboard.flat().some(button=>'callback_data' in button && button.callback_data==='cancel_id')) throw Error('Missing cancellation');
 }
 if(!quoteKeyboard('id').inline_keyboard.flat().some(button=>button.callback_data==='chg_id_0')) throw Error('Missing free delivery');
});
