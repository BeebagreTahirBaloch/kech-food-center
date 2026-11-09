export const activeOrders=data=>Array.isArray(data?.activeOrders)?data.activeOrders:data?.active?[data.active]:[];
export const assignmentMessages={already_taken:'An order was already taken. Refresh and select again; this batch was not accepted.',capacity_reached:'Your active-order limit is reached. Finish a delivery or select fewer orders.',orders_too_far_apart:'These delivery locations are too far apart for one rider.',finish_arrived_order:'Finish the delivery where you have already arrived before accepting another.',invalid_selection:'Select between one and five orders.',not_authorized:'Not authorized',settings_unavailable:'Delivery settings are unavailable. Refresh and try again.',you_have_an_active_order:'The database still allows one order. Ask the owner to apply the multiple-orders update.'};
export function dropDistance(a,b){
 if([a.lat,a.lng,b.lat,b.lng].some(n=>n==null||!Number.isFinite(Number(n))))return Infinity;
 const rad=n=>Number(n)*Math.PI/180,h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
 return 12742*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
export function batchProblem(existing,added,limit,radius){
 if(existing.length+added.length>limit)return assignmentMessages.capacity_reached;
 if(existing.some(o=>o.arrived_at))return assignmentMessages.finish_arrived_order;
 const stops=[...existing,...added];
 for(let i=0;i<stops.length;i++)for(let j=i+1;j<stops.length;j++)if(dropDistance(stops[i],stops[j])>radius)return assignmentMessages.orders_too_far_apart;
 return '';
}
