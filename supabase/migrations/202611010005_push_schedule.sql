-- Run LAST, after setting the two Vault secrets described in docs/DEPLOYMENT.md.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$ declare job record; begin
 if not exists(select 1 from vault.decrypted_secrets where name='kfc_push_cron_secret') or not exists(select 1 from vault.decrypted_secrets where name='kfc_supabase_url') then
  raise exception 'Create kfc_push_cron_secret and kfc_supabase_url in Supabase Vault first';
 end if;
 for job in select jobid from cron.job where jobname='kfc-rider-push-worker' loop perform cron.unschedule(job.jobid); end loop;
 perform cron.schedule('kfc-rider-push-worker','* * * * *', $job$
  select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='kfc_supabase_url' limit 1)||'/functions/v1/rider-push',
   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='kfc_push_cron_secret' limit 1)),
   body := '{}'::jsonb, timeout_milliseconds := 60000
  );
 $job$);
end $$;
commit;
