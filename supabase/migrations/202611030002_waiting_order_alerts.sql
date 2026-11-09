begin;
alter table public.delivery_settings add column if not exists pending_alert_minutes integer not null default 10;
alter table public.delivery_settings drop constraint if exists delivery_settings_pending_alert_check;
alter table public.delivery_settings add constraint delivery_settings_pending_alert_check check(pending_alert_minutes between 1 and 120);
create or replace function public.rider_availability() returns jsonb
language sql stable security definer set search_path='' as $$
 with available as (
 select exists(select 1 from public.orders o where o.rider_id=r.user_id and o.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) as busy
 from public.riders r where r.active and r.online and not exists(select 1 from public.admins a where a.user_id=r.user_id)
 ) select jsonb_build_object('allBusy',count(*)>0 and coalesce(bool_and(busy),false)) from available
$$;
revoke all on function public.rider_availability() from public;
grant execute on function public.rider_availability() to anon,authenticated;
create or replace function public.admin_waiting_orders() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare threshold int; result jsonb;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 select pending_alert_minutes into threshold from public.delivery_settings where id;
 with waiting as (
 select id,created_at,greatest(created_at,released_at) as waiting_since,
 floor(extract(epoch from (now()-greatest(created_at,released_at)))/60)::int as minutes_waiting
 from public.orders where status='pending' and rider_id is null
 and greatest(created_at,released_at)<=now()-make_interval(mins=>threshold)
 ), oldest as (select * from waiting order by waiting_since,id limit 20)
 select jsonb_build_object('threshold',threshold,'count',(select count(*) from waiting),'orders',coalesce((select jsonb_agg(oldest order by waiting_since,id) from oldest),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.admin_waiting_orders() from public,anon;
grant execute on function public.admin_waiting_orders() to authenticated;
create or replace function public.admin_cancel_waiting_order(p_order_id uuid,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Enter a reason (3 to 500 characters)'; end if;
 update public.orders set status='cancelled',cancelled_at=now(),cancelled_by='admin',cancel_reason='other',cancel_note=trim(p_reason)
 where id=p_order_id and status='pending' and rider_id is null;
 if not found then return 'Order already changed'; end if;
 insert into public.order_events(order_id,actor_id,event,reason) values(p_order_id,auth.uid(),'cancelled',trim(p_reason));
 return 'cancelled';
end $$;
revoke all on function public.admin_cancel_waiting_order(uuid,text) from public,anon;
grant execute on function public.admin_cancel_waiting_order(uuid,text) to authenticated;
commit;
