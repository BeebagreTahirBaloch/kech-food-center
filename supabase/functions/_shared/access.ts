import {createClient} from 'npm:@supabase/supabase-js@2';
export function serviceClient(){return createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function caller(request:Request,role:'is_admin'|'is_rider'){
 const authorization=request.headers.get('authorization') || '';
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data,error}=await client.auth.getUser();
 if(error || !data.user)throw Error('Not authorized');
 const result=await client.rpc(role);
 if(result.error || result.data!==true)throw Error('Not authorized');
 return {client,user:data.user};
}
