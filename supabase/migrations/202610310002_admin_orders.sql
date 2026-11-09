begin;
alter table public.orders add column if not exists confirmed_at timestamptz;
alter table public.orders add column if not exists out_for_delivery_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated using(public.is_admin());
-- Private columns retain their existing column restrictions. Full rows are available
-- only through this checked RPC, never by granting all authenticated users SELECT *.
create or replace function public.admin_orders_report(p_from date default null,p_to date default null,p_status text default '',p_search text default '',p_page int default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; today date := (now() at time zone 'Asia/Karachi')::date;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_page<0 or (p_from is not null and p_to is not null and p_to<p_from) then raise exception 'Invalid range'; end if;
 with filtered as (
 select * from public.orders where
 (p_from is null or created_at >= p_from::timestamp at time zone 'Asia/Karachi') and
 (p_to is null or created_at < (p_to+1)::timestamp at time zone 'Asia/Karachi') and
 (coalesce(p_status,'')='' or status=p_status) and
 (coalesce(p_search,'')='' or position(lower(p_search) in lower(customer_name||' '||phone||' '||id::text))>0)
 ), page as (select * from filtered order by created_at desc,id desc limit 25 offset p_page*25)
 select jsonb_build_object('orders',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'count',(select count(*) from filtered),
 'summary',(select jsonb_build_object('Delivered',count(*) filter(where status='delivered'),'In progress',count(*) filter(where status not in ('delivered','cancelled','declined')),'Cancelled',count(*) filter(where status='cancelled'),
 'Total sales',coalesce(sum(subtotal+coalesce(delivery_charge,0)) filter(where status='delivered'),0),
 'Delivery charges',coalesce(sum(delivery_charge) filter(where status='delivered'),0),
 'Average order value',coalesce(round(avg(subtotal+coalesce(delivery_charge,0)) filter(where status='delivered'),2),0)) from filtered),
 'periods',(select jsonb_build_object('Orders today',count(*) filter(where created_at >= today::timestamp at time zone 'Asia/Karachi'),'Orders this week',count(*) filter(where created_at >= date_trunc('week',today::timestamp) at time zone 'Asia/Karachi'),'Orders this month',count(*) filter(where created_at >= date_trunc('month',today::timestamp) at time zone 'Asia/Karachi'),'Orders all time',count(*)) from public.orders)) into result;
 return result;
end; $$;
revoke all on function public.admin_orders_report(date,date,text,text,int) from public,anon;
grant execute on function public.admin_orders_report(date,date,text,text,int) to authenticated;
drop policy if exists admin_orders_broadcast_read on realtime.messages;
create policy admin_orders_broadcast_read on realtime.messages for select to authenticated using(realtime.topic()='admin-orders' and public.is_admin());
create or replace function public.broadcast_admin_orders() returns trigger language plpgsql security definer set search_path='' as $$
begin perform realtime.send('{}'::jsonb,'changed','admin-orders',true); return new; end; $$;
drop trigger if exists orders_admin_broadcast on public.orders;
create trigger orders_admin_broadcast after insert or update on public.orders for each row execute function public.broadcast_admin_orders();
commit;
