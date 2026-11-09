import {reorderLines} from '../lib/reorder.js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMenu } from './MenuContext.jsx';
const CartContext = createContext(null);
function readCart() {
  try { const saved=JSON.parse(localStorage.getItem('cart') || '[]'); return Array.isArray(saved) ? saved.filter(x => typeof x.itemId==='string' && (x.sizeId===null || typeof x.sizeId==='string') && Number.isInteger(x.quantity) && x.quantity>0).map(x=>({itemId:x.itemId,sizeId:x.sizeId,quantity:Math.min(99,x.quantity)})) : []; } catch { return []; }
}
export function CartProvider({ children }) {
  const { catalog, ready, error } = useMenu();
  const [lines,setLines]=useState(readCart);
  const [notice,setNotice]=useState(() => { try { return JSON.parse(localStorage.getItem('cart') || '[]').some(x=>!x.itemId) ? 'The menu was upgraded. Please add your items again.' : ''; } catch { return ''; } });
  const resolve = line => {
    const product=catalog.find(x=>x.id===line.itemId && x.is_available && !x.is_deleted);
    if (!product) return null;
    const option=product.options.find(x=>x.id===line.sizeId);
    if (product.price===null ? !option : line.sizeId!==null) return null;
    return {...line,productId:product.id,name:product.name,image:product.image,label:option?.label || '',price:option?.price ?? product.price};
  };
  const items=useMemo(()=>lines.map(resolve).filter(Boolean),[lines,catalog]);
  useEffect(()=> { if (!ready || error) return; const valid=lines.filter(resolve); if(valid.length!==lines.length) { setLines(valid); setNotice('An item or size is no longer available and was removed from your cart.'); } },[catalog,ready,error,lines]);
  useEffect(()=> { try { localStorage.setItem('cart',JSON.stringify(lines)); } catch {} },[lines]);
  const same=(a,b)=>a.itemId===b.itemId && a.sizeId===b.sizeId;
  function addItem(product,option,quantity=1) {
    const line={itemId:product.id,sizeId:option?.id || null,quantity};
    if(!resolve(line)) { setNotice('This item is no longer available.'); return; }
    setLines(current=>current.some(x=>same(x,line)) ? current.map(x=>same(x,line) ? {...x,quantity:Math.min(99,x.quantity+quantity)} : x) : [...current,line]);
  }
  function orderAgain(snapshot) {
    const {lines:added,skipped}=reorderLines(snapshot,catalog);
    setLines(current=>{const next=[...current];for(const line of added){const i=next.findIndex(x=>same(x,line));if(i<0)next.push(line);else next[i]={...next[i],quantity:Math.min(99,next[i].quantity+line.quantity)};}return next;});
    setNotice(`${added.length?'Available items added at current menu prices. Review your cart before ordering.':'No items from that order are available.'}${skipped.length?' Unavailable: '+skipped.join(', '):''}`);
    return added.length;
  }
  const value={items,notice,orderAgain,count:items.reduce((n,x)=>n+x.quantity,0),subtotal:items.reduce((n,x)=>n+x.price*x.quantity,0),addItem,
    changeQuantity:(line,amount)=>setLines(current=>current.flatMap(x=>same(x,line) ? x.quantity+amount>0 ? [{...x,quantity:Math.min(99,x.quantity+amount)}] : [] : [x])),
    removeItem:line=>setLines(current=>current.filter(x=>!same(x,line))),clear:()=>setLines([])};
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export const useCart=()=>useContext(CartContext);
