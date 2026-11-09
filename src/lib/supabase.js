import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
// Independent role sessions prevent an open wrong-role tab from logging out
// the other app. Customer endpoints always use the anonymous client.
const client = (storageKey, persistSession=true) => isSupabaseConfigured
  ? createClient(supabaseUrl,supabaseAnonKey,{auth:{storageKey,persistSession,autoRefreshToken:persistSession}})
  : null;
const project = supabaseUrl ? new URL(supabaseUrl).hostname : 'unconfigured';
export const supabase = client(`kfc-${project}-customer`,false);
export const adminSupabase = client(`kfc-${project}-admin`);
export const riderSupabase = client(`kfc-${project}-rider`);
