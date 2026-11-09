import {adminSupabase as supabase} from './supabase.js';
export async function rpc(name,args={}){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
export async function edge(name,body){const {data,error}=await supabase.functions.invoke(name,{body});if(error){let message='Unable to complete this action.';try{message=(await error.context.json()).error || message;}catch{}throw new Error(message);}return data;}
export const activeStatuses=['awaiting_charge','quoted','confirmed','preparing','out_for_delivery'];
export const money=n=>`Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
export const date=n=>n?new Date(n).toLocaleString('en-GB',{timeZone:'Asia/Karachi'}):'—';
export async function adminSignOut(){
 try{const reg=await navigator.serviceWorker?.getRegistration('/');const sub=await reg?.pushManager?.getSubscription();if(sub){const {error}=await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)throw error;}}catch{throw Error('Could not turn off owner alerts. Reconnect before signing out.');}
 const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw Error('Sign out failed. Reconnect and try again.');
}

