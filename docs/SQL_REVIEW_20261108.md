# Multiple-order SQL review

Every new/replaced database function, index, grant and trigger is printed below. No new RLS policies are introduced. Existing order and settings policies remain in effect. See MULTIPLE_RIDER_ORDERS.md for deployment order.

```sql
begin;
-- Apply after the 20261107 customer/owner updates. No order is removed or reset.
alter table public.delivery_settings add column if not exists max_active_orders int not null default 3;
alter table public.delivery_settings add column if not exists nearby_order_km numeric not null default 1;
alter table public.delivery_settings drop constraint if exists settings_rider_capacity_check;
alter table public.delivery_settings add constraint settings_rider_capacity_check check(max_active_orders between 1 and 5 and nearby_order_km between 0.1 and 10);
drop index if exists public.orders_one_active_rider;
create index if not exists orders_active_rider on public.orders(rider_id,accepted_at,id) where rider_id is not null and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery');

-- Private helper; callers must hold the assignment advisory lock and order locks.
create or replace function public.rider_batch_check(p_rider uuid,p_orders uuid[]) returns text language plpgsql security definer set search_path='' as $$
declare capacity int;radius numeric;total int;
begin
 select max_active_orders,nearby_order_km into capacity,radius from public.delivery_settings where id for share;
 if capacity is null then return 'settings_unavailable';end if;
 select count(*) into total from public.orders where id=any(p_orders) or (rider_id=p_rider and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery'));
 if total>capacity then return 'capacity_reached';end if;
 if exists(select 1 from public.orders where rider_id=p_rider and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') and arrived_at is not null and not(id=any(p_orders))) then return 'finish_arrived_order';end if;
 if exists(
  with stops as(select id,lat,lng from public.orders where id=any(p_orders) or (rider_id=p_rider and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')))
  select 1 from stops a join stops b on a.id<b.id where
  12742*asin(sqrt(least(1::double precision,greatest(0::double precision,
   power(sin(radians(b.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lng-a.lng)/2),2)))))>radius
 ) then return 'orders_too_far_apart';end if;
 return 'ok';
end $$;

create or replace function public.accept_orders(p_order_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];result text;
begin
 if not coalesce(public.is_rider(),false) then return jsonb_build_object('status','not_authorized');end if;
 if p_order_ids is null or cardinality(p_order_ids) not between 1 and 5 or array_position(p_order_ids,null) is not null then return jsonb_build_object('status','invalid_selection');end if;
 select array_agg(distinct x order by x) into ids from unnest(p_order_ids) x;
 -- The same lock is used by release/reassign. Two devices cannot exceed capacity.
 perform pg_advisory_xact_lock(710011);
 perform 1 from public.riders where user_id=auth.uid() and active for share;
 if not found then return jsonb_build_object('status','not_authorized');end if;
 perform 1 from public.orders where id=any(ids) or (rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) order by id for update;
 if (select count(*) from public.orders where id=any(ids) and status='pending' and rider_id is null)<>cardinality(ids) then return jsonb_build_object('status','already_taken');end if;
 result=public.rider_batch_check(auth.uid(),ids);
 if result<>'ok' then return jsonb_build_object('status',result);end if;
 update public.orders set rider_id=auth.uid(),accepted_at=now(),status='awaiting_charge' where id=any(ids);
 return jsonb_build_object('status','accepted','orderIds',ids);
end $$;
-- Keep old clients compatible; both single and batch acceptance use the same rules.
create or replace function public.accept_order(order_id uuid) returns text language sql security definer set search_path='' as $$
 select public.accept_orders(array[order_id])->>'status'
$$;

create or replace function public.reassign_order(order_id uuid,new_rider uuid,reason text) returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(710011);
 perform 1 from public.riders r where user_id=new_rider and active and not exists(select 1 from public.admins a where a.user_id=r.user_id) for share;
 if not found then return 'not_authorized';end if;
 perform 1 from public.orders where id=order_id or (rider_id=new_rider and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) order by id for update;
 if not exists(select 1 from public.orders where id=order_id and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') and rider_id is distinct from new_rider) then return 'Order already changed';end if;
 result=public.rider_batch_check(new_rider,array[order_id]);if result<>'ok' then return result;end if;
 result=public.release_order(order_id,reason);if result<>'released' then return result;end if;
 update public.orders set rider_id=new_rider,accepted_at=now(),status='awaiting_charge' where id=order_id;
 insert into public.order_events(order_id,actor_id,event,reason) values(order_id,auth.uid(),'reassigned',new_rider::text||': '||reason);
 return 'reassigned';
end $$;

create or replace function public.rider_dashboard(history_page int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare active_rows jsonb;
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('call_count',(select count(*) from public.call_attempts c where c.order_id=o.id and c.rider_id=auth.uid() and c.created_at>=o.accepted_at)) order by o.accepted_at,o.id),'[]'::jsonb)
 into active_rows from public.orders o where rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery');
 return jsonb_build_object(
  'profile',(select to_jsonb(r) from public.riders r where user_id=auth.uid()),
  'pending',coalesce((select jsonb_agg(x order by x.created_at,x.id) from (select id,address,items,subtotal,distance_km,estimated_delivery_charge,lat,lng,created_at from public.orders where status='pending' and rider_id is null order by created_at,id limit 100) x),'[]'::jsonb),
  'active',active_rows->0,'activeOrders',active_rows,
  'history',coalesce((select jsonb_agg(x order by x.created_at desc,x.id) from (select * from public.orders where rider_id=auth.uid() and status in ('delivered','cancelled') order by created_at desc,id limit 25 offset greatest(history_page,0)*25) x),'[]'::jsonb),
  'today',(select jsonb_build_object('delivered',count(*),'charges',coalesce(sum(delivery_charge),0),'sales',coalesce(sum(total),0)) from public.orders where rider_id=auth.uid() and status='delivered' and delivered_at>=date_trunc('day',now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'),
  'wait_minutes',(select wait_minutes from public.delivery_settings where id),
  'maxActiveOrders',(select max_active_orders from public.delivery_settings where id),
  'nearbyOrderKm',(select nearby_order_km from public.delivery_settings where id)
 );
end $$;
create or replace function public.rider_availability() returns jsonb language sql stable security definer set search_path='' as $$
 with available as (
 select (select count(*) from public.orders o where o.rider_id=r.user_id and o.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) >= (select max_active_orders from public.delivery_settings where id)
 or exists(select 1 from public.orders o where o.rider_id=r.user_id and o.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') and arrived_at is not null) as busy
 from public.riders r where r.active and r.online and not exists(select 1 from public.admins a where a.user_id=r.user_id)
 ) select jsonb_build_object('allBusy',count(*)>0 and coalesce(bool_and(busy),false),'noneOnline',count(*)=0) from available
$$;
-- Record capacity/radius edits using the existing private owner audit table.
create or replace function public.audit_rider_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.max_active_orders,new.nearby_order_km) is distinct from (old.max_active_orders,old.nearby_order_km) then
 insert into public.admin_activity(actor_id,action,entity,entity_id,before_data,after_data) values(auth.uid(),'UPDATE','rider_capacity','true',jsonb_build_object('max_active_orders',old.max_active_orders,'nearby_order_km',old.nearby_order_km),jsonb_build_object('max_active_orders',new.max_active_orders,'nearby_order_km',new.nearby_order_km));end if;return new;
end $$;
drop trigger if exists delivery_settings_capacity_audit on public.delivery_settings;
create trigger delivery_settings_capacity_audit after update on public.delivery_settings for each row execute function public.audit_rider_capacity();
revoke all on function public.rider_batch_check(uuid,uuid[]),public.audit_rider_capacity() from public,anon,authenticated;
revoke all on function public.accept_orders(uuid[]),public.accept_order(uuid),public.reassign_order(uuid,uuid,text),public.rider_dashboard(integer) from public,anon;
grant execute on function public.accept_orders(uuid[]),public.accept_order(uuid),public.reassign_order(uuid,uuid,text),public.rider_dashboard(integer) to authenticated;
revoke all on function public.rider_availability() from public;
grant execute on function public.rider_availability() to anon,authenticated;
-- Existing settings_admin policy still permits only admins to read/change settings.
-- No new public column/table grants and no new RLS policies.
commit;
```
