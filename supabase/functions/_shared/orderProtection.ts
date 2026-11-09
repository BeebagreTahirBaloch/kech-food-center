export async function fingerprint(value: unknown) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function phoneHash(phone:string,secret:string){
 let digits=phone.replace(/\D/g,'');
 if(digits.startsWith('0092'))digits=digits.slice(2);
 if(digits.startsWith('0'))digits='92'+digits.slice(1);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('order-rate:'+digits));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// Bound memory use even for chunked requests with no Content-Length.
export async function readOrderBody(request:Request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing order');
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>32768){await reader.cancel();throw Error('Order request is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
