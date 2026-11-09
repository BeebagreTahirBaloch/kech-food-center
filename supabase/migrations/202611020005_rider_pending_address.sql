begin;
-- Pending delivery addresses are visible only through the active-rider dashboard.
create or replace function public.rider_dashboard(history_page int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 select jsonb_build_object(
 'profile',(select to_jsonb(r) from public.riders r where user_id=auth.uid()),
 'pending',coalesce((select jsonb_agg(x) from (select id,address,items,subtotal,distance_km,estimated_delivery_charge,lat,lng,created_at from public.orders where status='pending' and rider_id is null order by created_at limit 100) x),'[]'::jsonb),
 'active',(select to_jsonb(o)||jsonb_build_object('call_count',(select count(*) from public.call_attempts c where c.order_id=o.id and c.rider_id=auth.uid() and c.created_at>=o.accepted_at)) from public.orders o where rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') limit 1),
 'history',coalesce((select jsonb_agg(x) from (select * from public.orders where rider_id=auth.uid() and status in ('delivered','cancelled') order by created_at desc limit 25 offset greatest(history_page,0)*25) x),'[]'::jsonb),
 'today',(select jsonb_build_object('delivered',count(*),'charges',coalesce(sum(delivery_charge),0),'sales',coalesce(sum(total),0)) from public.orders where rider_id=auth.uid() and status='delivered' and delivered_at>=date_trunc('day',now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'),
 'wait_minutes',(select wait_minutes from public.delivery_settings where id)
 ) into result;
 return result;
end $$;
revoke all on function public.rider_dashboard(integer) from public,anon;
grant execute on function public.rider_dashboard(integer) to authenticated;
commit;
