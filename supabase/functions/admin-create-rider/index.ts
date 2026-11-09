import {caller,serviceClient} from '../_shared/access.ts';
import {preflight,rejectOrigin,jsonResponse} from '../_shared/cors.ts';
import {isTelegramEnabled} from '../_shared/telegram.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return preflight(request);
 const denied=rejectOrigin(request);if(denied)return denied;
 if(request.method!=='POST')return jsonResponse(request,{error:'Method not allowed'},405);
 try{await caller(request,'is_admin');}catch{return jsonResponse(request,{error:'Not authorized'},403);}
 try {
  const body=await request.json();const db=serviceClient();
  if(body.action==='status')return jsonResponse(request,{telegramEnabled:isTelegramEnabled()});
  const password=body.password;
  if(['create','reset'].includes(body.action) && (typeof password!=='string' || password.length<12 || password.length>128))return jsonResponse(request,{error:'Use a password of 12–128 characters.'},400);
  if(['create','edit'].includes(body.action) && (typeof body.name!=='string' || body.name.trim().length<2 || body.name.length>80 || typeof body.phone!=='string' || !/^[+0-9 ()-]{7,20}$/.test(body.phone)))return jsonResponse(request,{error:'Enter a valid name and phone.'},400);
  if(body.action==='create'){
   const {data,error}=await db.auth.admin.createUser({email:body.email,password,email_confirm:true});
   if(error || !data.user)return jsonResponse(request,{error:'Unable to create account. Check email and password requirements.'},400);
   const saved=await db.from('riders').insert({user_id:data.user.id,name:body.name.trim(),phone:body.phone});
   if(saved.error){await db.auth.admin.deleteUser(data.user.id);throw saved.error;}
  }else{
   const {data}=await db.from('riders').select('user_id').eq('user_id',body.userId).maybeSingle();
   if(!data)return jsonResponse(request,{error:'Rider not found'},404);
   if(body.action==='reset'){const result=await db.auth.admin.updateUserById(body.userId,{password});if(result.error)throw result.error;}
   else if(body.action==='edit'){const result=await db.from('riders').update({name:body.name.trim(),phone:body.phone}).eq('user_id',body.userId);if(result.error)throw result.error;}
   else if(body.action==='active' && typeof body.active==='boolean'){
    const result=await db.from('riders').update({active:body.active,...(!body.active?{online:false}:{})}).eq('user_id',body.userId);if(result.error)throw result.error;
   }else return jsonResponse(request,{error:'Invalid action'},400);
  }
  return jsonResponse(request,{ok:true});
 }catch{return jsonResponse(request,{error:'Unable to update rider. Please try again.'},400);}
});
