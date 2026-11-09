// Old snapshots store productId/optionLabel. Resolve against today's catalogue;
// never copy saved prices or substitute an unavailable product.
export function reorderLines(snapshot, catalog) {
 const lines=[],skipped=[];
 for(const item of snapshot || []) {
  const id=item.productId ?? item.product_id ?? item.itemId;
  const candidates=catalog.filter(p=>id ? p.id===id : p.name===item.name);
  const product=candidates.length===1?candidates[0]:null;
  const label=item.optionLabel ?? item.option_label ?? item.sizeLabel ?? '';
  const options=product?.options || [];
  const size=options.find(s=>s.id===item.sizeId) || options.find(s=>s.label===label);
  if(!product || !product.is_available || product.is_deleted || (product.price===null&&!size) || (product.price!==null&&label) || !Number.isInteger(item.quantity) || item.quantity<1) {
   skipped.push(`${item.name || 'Item'}${label?' · '+label:''}`);continue;
  }
  lines.push({itemId:product.id,sizeId:product.price===null?size.id:null,quantity:Math.min(item.quantity,99)});
 }
 return {lines,skipped};
}
