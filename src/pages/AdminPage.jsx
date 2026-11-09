import {adminSignOut} from '../lib/adminApi.js';
import AdminQueueAlerts from '../components/AdminQueueAlerts.jsx';
import TelegramStatus from '../components/TelegramStatus.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminSupabase as supabase } from '../lib/supabase.js';
import { useMenu } from '../context/MenuContext.jsx';
import { imagePath, prepareImage } from '../lib/menuImages.js';
import '../admin.css';
function check(result) { if(result.error) throw result.error; return result.data; }

export default function AdminPage({ children }) {
  const [session,setSession]=useState(null), [allowed,setAllowed]=useState(false), [checking,setChecking]=useState(true);
  const [message,setMessage]=useState(''), [busy,setBusy]=useState(false);
  useEffect(()=> {
    if(!supabase) { setChecking(false); return; }
    let active=true;
    supabase.auth.getSession().then(({data,error})=> { if(active) { if(error) setMessage(error.message); setSession(data.session); setChecking(false); } });
    const {data}=supabase.auth.onAuthStateChange((_event,next)=> { setSession(next); });
    return ()=> { active=false; data.subscription.unsubscribe(); };
  },[]);
  useEffect(()=> {
    if(!session) { setAllowed(false); setChecking(false); return; }
    let active=true;
    setChecking(true);
    (async()=> {
      try {
        const row=check(await supabase.from('admins').select('user_id').eq('user_id',session.user.id).maybeSingle());
        if(!active) return;
        if(!row) { setMessage('Not authorized'); await supabase.auth.signOut({scope:"local"}); } else setAllowed(true);
      } catch(e) { if(active) { setMessage(e.message); setAllowed(false); } }
      finally { if(active) setChecking(false); }
    })();
    return ()=> { active=false; };
  },[session]);
  async function login(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form=new FormData(event.currentTarget);
    try { check(await supabase.auth.signInWithPassword({email:form.get('email'),password:form.get('password')})); }
    catch(e) { setMessage(e.message); } finally { setBusy(false); }
  }
  if(!supabase) return <main className="admin-page"><h1>Menu administration</h1><p>Configure the Supabase frontend environment first.</p></main>;
  if(checking) return <main className="admin-page" role="status">Checking access…</main>;
  if(!session || !allowed) return <main className="admin-page admin-login"><h1>Owner login</h1>{message && <p role="alert">{message}</p>}<form onSubmit={login}><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><Link to="/">Back to menu</Link></main>;
  return <><nav className="private-admin-nav" aria-label="Owner pages"><Link to="/admin">Menu</Link><Link to="/admin/orders">Orders and sales</Link><Link to="/admin/riders">Riders</Link><Link to="/admin/settings">Settings and alerts</Link><Link to="/admin/history">History and backups</Link><button onClick={()=>adminSignOut().catch(e=>setMessage(e.message))}>Sign out</button></nav>{message&&<p role="alert">{message}</p>}<AdminQueueAlerts/>{children || <AdminMenu/>}</>;
}

function AdminMenu() {
  const {refresh}=useMenu();
  const [categories,setCategories]=useState([]), [items,setItems]=useState([]), [search,setSearch]=useState('');
  const [toast,setToast]=useState(null), [busy,setBusy]=useState(false), [loaded,setLoaded]=useState(false), [editing,setEditing]=useState(null);
  async function load() {
    const [c,i]=await Promise.all([supabase.from('categories').select('*').order('sort_order').order('name'),supabase.from('menu_items').select('*,item_sizes(*)').order('sort_order').order('name')]);
    setCategories(check(c)); setItems(check(i)); setLoaded(true);
  }
  useEffect(()=> { load().catch(e=>setToast({error:true,text:e.message})); },[]);
  async function run(action,message) {
    setBusy(true); setToast(null);
    try { await action(); await load(); await refresh(); setToast({text:message}); }
    catch(e) { setToast({error:true,text:e.message}); }
    finally { setBusy(false); }
  }
  function deleteCategory(category) {
    if(!window.confirm(`Delete ${category.name}?`)) return;
    run(async()=> {
      const linked=check(await supabase.from('menu_items').select('id,is_deleted').eq('category_id',category.id));
      if(linked.length) {
        await load();
        const hidden=linked.filter(item=>item.is_deleted).length;
        throw new Error(`${category.name} contains ${linked.length-hidden} active and ${hidden} deleted items. Move active items using Edit. Permanently delete or move hidden items in Deleted items below, then delete the category.`);
      }
      const deleted=check(await supabase.from('categories').delete().eq('id',category.id).select('id'));
      if(!deleted.length) throw new Error('Category was not deleted. Refresh and check your admin access.');
    },'Category deleted');
  }
  function permanentlyDeleteItem(item) {
    if(!window.confirm(`Permanently delete "${item.name}" and all its sizes from the database? This cannot be undone. Past orders will keep their saved item details.`)) return;
    run(async()=> {
      const deleted=check(await supabase.from('menu_items').delete().eq('id',item.id).eq('is_deleted',true).select('id'));
      if(!deleted.length) throw new Error('Item was not deleted. It may have changed, or your admin access may have expired. Refresh and try again.');
    },'Item and its sizes permanently deleted. Past orders are preserved.');
  }
  const blank=()=>({name:'',description:'',category_id:categories[0]?.id || '',base_price:'',image_url:'',is_available:true,sort_order:items.length,item_sizes:[]});
  return <main className="admin-page">
    <header className="admin-heading"><div><p>Kech Food Center</p><h1>Manage menu</h1><TelegramStatus/></div></header>
    {toast && <div className={`admin-toast ${toast.error?'error':''}`} role={toast.error?'alert':'status'}>{toast.text}<button aria-label="Dismiss notification" onClick={()=>setToast(null)}>×</button></div>}
    {!loaded && <button onClick={()=>run(load,'Menu loaded')}>Load menu</button>}
    <section><h2>Categories</h2><p>Lower order numbers appear first. Categories containing items, including deleted items, cannot be deleted.</p>
      {categories.map(category=><form className="admin-category" key={`${category.id}:${category.name}:${category.sort_order}`} onSubmit={e=> { e.preventDefault(); const form=new FormData(e.currentTarget); run(async()=>check(await supabase.from('categories').update({name:String(form.get('name')).trim(),sort_order:Number(form.get('sort_order'))}).eq('id',category.id)),'Category saved'); }}>
        <label>Name<input name="name" defaultValue={category.name} required/><small>{items.filter(i=>i.category_id===category.id && !i.is_deleted).length} active · {items.filter(i=>i.category_id===category.id && i.is_deleted).length} deleted</small></label><label>Order<input name="sort_order" type="number" step="1" defaultValue={category.sort_order} required/></label><button disabled={busy}>Save</button><button type="button" disabled={busy} onClick={()=>deleteCategory(category)}>Delete</button>
      </form>)}
      <form className="admin-category" onSubmit={e=> { e.preventDefault(); const form=e.currentTarget; const name=new FormData(form).get('name').trim(); run(async()=>{check(await supabase.from('categories').insert({name,sort_order:categories.length})); form.reset();},'Category added'); }}><label>New category<input name="name" required/></label><button disabled={busy}>Add category</button></form>
    </section>
    <section><div className="admin-heading"><h2>Items</h2><button disabled={busy || !categories.length} onClick={()=>setEditing(blank())}>Add item</button></div><label>Search items<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or description"/></label>
      {categories.map(category=><div key={category.id}><h3>{category.name}</h3>{items.filter(i=>i.category_id===category.id && !i.is_deleted && `${i.name} ${i.description}`.toLowerCase().includes(search.toLowerCase())).map(item=><article className="admin-item" key={item.id}>
        {item.image_url && <img src={item.image_url} alt=""/>}<div><strong>{item.name}</strong><p>{item.base_price===null?`${item.item_sizes.length} sizes`:`Rs. ${item.base_price}`}</p></div>
        <button disabled={busy} onClick={()=>run(async()=>check(await supabase.from('menu_items').update({is_available:!item.is_available}).eq('id',item.id)), 'Availability updated')}>{item.is_available?'Available':'Sold out'}</button>
        <button disabled={busy} onClick={()=>setEditing(item)}>Edit</button><button disabled={busy} onClick={()=> { if(window.confirm(`Delete ${item.name} from the menu? Existing orders will be preserved.`)) run(async()=>check(await supabase.from('menu_items').update({is_deleted:true}).eq('id',item.id)),'Item deleted'); }}>Delete</button>
      </article>)}</div>)}
    </section>
    <section><h2>Deleted items</h2><p>Permanently delete these items and their sizes from the database, or move them to another category. Permanent deletion cannot be undone. Past orders keep their saved item details.</p>
      {!items.some(i=>i.is_deleted) && <p>No deleted items</p>}
      {items.filter(i=>i.is_deleted).map(item=><form className="admin-category" key={item.id+item.category_id} onSubmit={e=>{
        e.preventDefault(); const destination=new FormData(e.currentTarget).get('category_id');
        run(async()=>{
          const moved=check(await supabase.from('menu_items').update({category_id:destination}).eq('id',item.id).eq('is_deleted',true).select('id'));
          if(!moved.length) throw new Error('Item changed or could not be moved. Refresh and try again.');
        },'Deleted item moved; it remains hidden from customers');
      }}>
        <div><strong>{item.name}</strong><p>In {categories.find(c=>c.id===item.category_id)?.name}</p></div>
        <label>Move to category<select name="category_id" defaultValue="" required><option value="" disabled>Select another category</option>{categories.filter(c=>c.id!==item.category_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button disabled={busy || categories.length<2}>Move deleted item</button>
        <button type="button" disabled={busy} onClick={()=>permanentlyDeleteItem(item)}>Delete permanently</button>
      </form>)}
      {items.some(i=>i.is_deleted) && categories.length<2 && <p>To move an item instead of permanently deleting it, add another category above.</p>}
    </section>
    {editing && <ItemEditor key={editing.id || 'new'} item={editing} categories={categories} onClose={()=>setEditing(null)} onSaved={async(warning)=>{setEditing(null); await load(); await refresh(); setToast({error:Boolean(warning),text:warning || 'Item saved'});}}/>}
  </main>;
}

function ItemEditor({item,categories,onClose,onSaved}) {
  const [form,setForm]=useState({...item}), [sizes,setSizes]=useState([...item.item_sizes].sort((a,b)=>a.sort_order-b.sort_order));
  const [hasSizes,setHasSizes]=useState(item.base_price===null), [blob,setBlob]=useState(null), [preview,setPreview]=useState(item.image_url), [busy,setBusy]=useState(false), [processing,setProcessing]=useState(false), [error,setError]=useState('');
  useEffect(()=> { if(!blob) return; const url=URL.createObjectURL(blob); setPreview(url); return ()=>URL.revokeObjectURL(url); },[blob]);
  function field(e) { setForm({...form,[e.target.name]:e.target.value}); }
  function move(index,direction) { const next=[...sizes], target=index+direction; if(target<0 || target>=next.length) return; [next[index],next[target]]=[next[target],next[index]]; setSizes(next); }
  async function uploadSelection(e) { const file=e.target.files[0]; if(!file) return; setProcessing(true); setError(''); try { setBlob(await prepareImage(file)); } catch(err) { setError(err.message); e.target.value=''; } finally { setProcessing(false); } }
  async function save(e) {
    e.preventDefault(); setError(''); setBusy(true); let uploaded=null, saved=false;
    try {
      const positive=n=>Number.isSafeInteger(Number(n)) && Number(n)>0 && Number(n)<=2147483647;
      if(!form.name.trim()) throw new Error('Name is required.');
      if(hasSizes ? !sizes.length || sizes.some(s=>!s.label.trim() || !positive(s.price)) : !positive(form.base_price)) throw new Error('Enter a positive whole-rupee price for the item or every size.');
      if(new Set(sizes.map(s=>s.label.trim().toLowerCase())).size!==sizes.length && hasSizes) throw new Error('Size labels must be unique.');
      let image_url=form.image_url;
      if(blob) { uploaded=`items/${crypto.randomUUID()}.webp`; check(await supabase.storage.from('menu-images').upload(uploaded,blob,{contentType:'image/webp'})); image_url=supabase.storage.from('menu-images').getPublicUrl(uploaded).data.publicUrl; }
      check(await supabase.rpc('save_menu_item',{p_item:{id:form.id,category_id:form.category_id,name:form.name.trim(),description:form.description,image_url,base_price:hasSizes?null:Number(form.base_price),is_available:form.is_available,sort_order:Number(form.sort_order)},p_sizes:hasSizes?sizes.map((s,index)=>({id:s.id,label:s.label.trim(),price:Number(s.price),sort_order:index})):[]}));
      saved=true; let warning='';
      const old=imagePath(item.image_url);
      if(uploaded && old) { const result=await supabase.storage.from('menu-images').remove([old]); if(result.error) warning='Item saved, but the previous image could not be removed. Remove it from Storage manually.'; }
      await onSaved(warning);
    } catch(err) {
      if(uploaded && !saved) await supabase.storage.from('menu-images').remove([uploaded]);
      setError(err.message);
    } finally { setBusy(false); }
  }
  return <div className="admin-overlay"><section className="admin-editor" role="dialog" aria-modal="true" aria-labelledby="edit-title"><h2 id="edit-title">{item.id?'Edit item':'Add item'}</h2><form onSubmit={save}>
    {error && <p role="alert">{error}</p>}
    <label>Name<input name="name" value={form.name} onChange={field} required autoFocus/></label>
    <label>Description<textarea name="description" value={form.description} onChange={field}/></label>
    <label>Category<select name="category_id" value={form.category_id} onChange={field} required>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Display order<input name="sort_order" type="number" step="1" value={form.sort_order} onChange={field} required/></label>
    <label>Pricing<select value={hasSizes?'sizes':'price'} onChange={e=>setHasSizes(e.target.value==='sizes')}><option value="price">One price</option><option value="sizes">Prices by size</option></select></label>
    {hasSizes ? <fieldset><legend>Sizes</legend>{sizes.map((size,index)=><div className="admin-size" key={size.id || index}><label>Label<input value={size.label} onChange={e=>setSizes(sizes.map((s,i)=>i===index?{...s,label:e.target.value}:s))} required/></label><label>Price (Rs.)<input type="number" min="1" step="1" value={size.price} onChange={e=>setSizes(sizes.map((s,i)=>i===index?{...s,price:e.target.value}:s))} required/></label><button type="button" disabled={index===0} onClick={()=>move(index,-1)} aria-label="Move size up">↑</button><button type="button" disabled={index===sizes.length-1} onClick={()=>move(index,1)} aria-label="Move size down">↓</button><button type="button" onClick={()=>setSizes(sizes.filter((_,i)=>i!==index))}>Remove</button></div>)}<button type="button" onClick={()=>setSizes([...sizes,{label:'',price:''}])}>Add size</button></fieldset> : <label>Price (Rs.)<input name="base_price" type="number" min="1" step="1" value={form.base_price ?? ''} onChange={field} required/></label>}
    <label>Photo (JPG, PNG, WebP; maximum 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || processing} onChange={uploadSelection}/></label>
    {preview && <img className="admin-preview" src={preview} alt="Item preview"/>}
    <label><input type="checkbox" checked={form.is_available} onChange={e=>setForm({...form,is_available:e.target.checked})}/> Available to order</label>
    <div className="admin-heading"><button disabled={busy || processing}>{processing?'Preparing image…':busy?'Saving…':'Save item'}</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form></section></div>;
}
