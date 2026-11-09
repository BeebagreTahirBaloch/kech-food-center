begin;
create or replace function public.admin_orders_report_v2(p_from date default null,p_to date default null,p_status text default '',p_search text default '',p_page int default 0,p_rider uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; today date := (now() at time zone 'Asia/Karachi')::date;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_page<0 or (p_from is not null and p_to is not null and p_to<p_from) then raise exception 'Invalid range'; end if;
 with filtered as (
 select o.*,r.name as rider_name,r.phone as rider_phone,
 (select coalesce(jsonb_agg(c order by c.created_at),'[]'::jsonb) from public.call_attempts c where c.order_id=o.id) as call_attempts,
 (select coalesce(jsonb_agg(e order by e.created_at),'[]'::jsonb) from public.order_events e where e.order_id=o.id) as events
 from public.orders o left join public.riders r on r.user_id=o.rider_id where
 (p_rider is null or o.rider_id=p_rider) and
 (p_from is null or o.created_at >= p_from::timestamp at time zone 'Asia/Karachi') and
 (p_to is null or o.created_at < (p_to+1)::timestamp at time zone 'Asia/Karachi') and
 (coalesce(p_status,'')='' or status=p_status or (p_status='cancelled_by_rider' and status='cancelled' and cancelled_by='rider')) and
 (coalesce(p_search,'')='' or position(lower(p_search) in lower(customer_name||' '||o.phone||' '||o.id::text))>0)
 ), page as (select * from filtered order by created_at desc,id desc limit 25 offset p_page*25)
 select jsonb_build_object('orders',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'count',(select count(*) from filtered),
 'summary',(select jsonb_build_object('Delivered',count(*) filter(where status='delivered'),'In progress',count(*) filter(where status not in ('delivered','cancelled','declined')),'Cancelled',count(*) filter(where status='cancelled'),
 'Total sales',coalesce(sum(subtotal+coalesce(delivery_charge,0)) filter(where status='delivered'),0),
 'Delivery charges',coalesce(sum(delivery_charge) filter(where status='delivered'),0),
 'Average order value',coalesce(round(avg(subtotal+coalesce(delivery_charge,0)) filter(where status='delivered'),2),0)) from filtered),
 'riders',coalesce((select jsonb_agg(z) from (
 select r.user_id,r.name,r.active,
 exists(select 1 from public.orders busy where busy.rider_id=r.user_id and busy.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) as has_active,
 count(f.id) filter(where f.status='delivered') as delivered,
 count(f.id) filter(where f.status='cancelled') as cancelled,
 coalesce(sum(f.delivery_charge) filter(where f.status='delivered'),0) as delivery_charges,
 coalesce(sum(f.subtotal+f.delivery_charge) filter(where f.status='delivered'),0) as total_sales,
 coalesce(round(100.0*count(f.id) filter(where f.status='cancelled')/nullif(count(f.id) filter(where f.status in ('delivered','cancelled')),0),1),0) as cancel_rate,
 round(avg(extract(epoch from (f.delivered_at-f.accepted_at))/60) filter(where f.status='delivered'),1) as average_minutes
 from public.riders r left join filtered f on f.rider_id=r.user_id group by r.user_id
 ) z),'[]'::jsonb),
 'cancel_threshold',(select cancel_rate_threshold from public.delivery_settings where id),
 'periods',(select jsonb_build_object('Orders today',count(*) filter(where created_at >= today::timestamp at time zone 'Asia/Karachi'),'Orders this week',count(*) filter(where created_at >= date_trunc('week',today::timestamp) at time zone 'Asia/Karachi'),'Orders this month',count(*) filter(where created_at >= date_trunc('month',today::timestamp) at time zone 'Asia/Karachi'),'Orders all time',count(*)) from public.orders)) into result;
 return result;
end; $$;
revoke all on function public.admin_orders_report_v2(date,date,text,text,int,uuid) from public,anon;
grant execute on function public.admin_orders_report_v2(date,date,text,text,int,uuid) to authenticated;

commit;
