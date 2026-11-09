const STORAGE='kfc_checkout_request';
let memory=null;
export async function checkoutRequest(body){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
 const fingerprint=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 let saved=memory;
 try{saved=JSON.parse(sessionStorage.getItem(STORAGE))||saved;}catch{}
 if(saved?.fingerprint===fingerprint && /^[0-9a-f-]{36}$/i.test(saved.id)){memory=saved;return saved.id;}
 memory={id:crypto.randomUUID(),fingerprint};
 try{sessionStorage.setItem(STORAGE,JSON.stringify(memory));}catch{}
 return memory.id;
}
export function clearCheckoutRequest(){memory=null;try{sessionStorage.removeItem(STORAGE);}catch{}}
