begin;
create table if not exists public.order_cleanup_batches(id uuid primary key default gen_random_uuid(),admin_id uuid not null,created_at timestamptz not null default now(),cutoff timestamptz not null,snapshot jsonb not null);
alter table public.order_cleanup_batches enable row level security;
revoke all on public.order_cleanup_batches from public,anon,authenticated;
create or replace function public.prepare_order_cleanup(p_months int) returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff_time timestamptz; rows_json jsonb; batch_id uuid;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_months is null or p_months not in (6,12,24) then raise exception 'Choose 6, 12 or 24 months'; end if;
 cutoff_time:=now()-make_interval(months=>p_months);
 delete from public.order_cleanup_batches where created_at<now()-interval '1 hour';
 select coalesce(jsonb_agg(x),'[]'::jsonb) into rows_json from (
 select to_jsonb(o) as order_data,
 (select coalesce(jsonb_agg(c),'[]'::jsonb) from public.call_attempts c where c.order_id=o.id) as calls,
 (select coalesce(jsonb_agg(e),'[]'::jsonb) from public.order_events e where e.order_id=o.id) as events
 from public.orders o where status in ('delivered','cancelled') and created_at<cutoff_time
 and coalesce(delivered_at,cancelled_at,created_at)<cutoff_time order by created_at,id limit 500) x;
 if jsonb_array_length(rows_json)=0 then return jsonb_build_object('orders',rows_json); end if;
 insert into public.order_cleanup_batches(admin_id,cutoff,snapshot) values(auth.uid(),cutoff_time,rows_json) returning id into batch_id;
 return jsonb_build_object('batchId',batch_id,'cutoff',cutoff_time,'orders',rows_json);
end $$;
create or replace function public.delete_old_order_batch(p_batch uuid,p_confirmation text) returns integer language plpgsql security definer set search_path='' as $$
declare batch public.order_cleanup_batches; entry jsonb; current_order public.orders; ids uuid[]:='{}'; removed int;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm'; end if;
 select * into batch from public.order_cleanup_batches where id=p_batch and admin_id=auth.uid() for update;
 if not found or batch.created_at<now()-interval '1 hour' then raise exception 'Backup expired. Export a new CSV first.'; end if;
 for entry in select value from jsonb_array_elements(batch.snapshot) loop
  select * into current_order from public.orders where id=(entry->'order_data'->>'id')::uuid for update;
  if not found or current_order.status not in ('delivered','cancelled') or to_jsonb(current_order)<>entry->'order_data' then raise exception 'An order changed. Nothing was deleted. Export a fresh backup.'; end if;
  ids:=array_append(ids,current_order.id);
 end loop;
 delete from public.call_attempts where order_id=any(ids);
 delete from public.order_events where order_id=any(ids);
 delete from public.order_push_jobs where order_id=any(ids);
 delete from public.orders where id=any(ids);
 get diagnostics removed=row_count;
 delete from public.order_cleanup_batches b where exists(select 1 from jsonb_array_elements(b.snapshot) x where (x->'order_data'->>'id')::uuid=any(ids));
 return removed;
end $$;
revoke all on function public.prepare_order_cleanup(integer) from public,anon;
revoke all on function public.delete_old_order_batch(uuid,text) from public,anon;
grant execute on function public.prepare_order_cleanup(integer),public.delete_old_order_batch(uuid,text) to authenticated;
commit;
