begin;
-- Arrival estimates and sales history; existing order statuses remain unchanged.
alter table public.orders add column if not exists arrival_eta_at timestamptz;
alter table public.orders add column if not exists delay_reason text;
alter table public.orders add column if not exists progress_at timestamptz;
update public.orders set progress_at=greatest(created_at,accepted_at,confirmed_at,out_for_delivery_at,arrived_at) where progress_at is null;
alter table public.orders alter column progress_at set default now();
alter table public.orders alter column progress_at set not null;
alter table public.orders drop constraint if exists orders_delay_reason_check;
alter table public.orders add constraint orders_delay_reason_check check(delay_reason in ('traffic','other'));
grant select(arrival_eta_at,delay_reason) on public.orders to anon,authenticated;

create or replace function public.rider_availability() returns jsonb language sql stable security definer set search_path='' as $$
 with available as (
 select exists(select 1 from public.orders o where o.rider_id=r.user_id and o.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) as busy
 from public.riders r where r.active and r.online and not exists(select 1 from public.admins a where a.user_id=r.user_id)
 ) select jsonb_build_object('allBusy',count(*)>0 and coalesce(bool_and(busy),false),'noneOnline',count(*)=0) from available
$$;

create or replace function public.revise_order_eta(p_order uuid,p_minutes integer,p_reason text) returns text language plpgsql security definer set search_path='' as $$
begin
 if not (coalesce(public.is_admin(),false) or coalesce(public.is_rider(),false)) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_minutes is null or p_minutes not between 5 and 240 or p_reason is null or p_reason not in ('traffic','other') then raise exception 'Choose a time (5–240 minutes) and reason'; end if;
 update public.orders set arrival_eta_at=now()+make_interval(mins=>p_minutes),delay_reason=p_reason
 where id=p_order and status in ('confirmed','preparing','out_for_delivery') and (public.is_admin() or rider_id=auth.uid());
 if not found then return 'Order already changed'; end if;
 insert into public.order_events(order_id,actor_id,event,reason) values(p_order,auth.uid(),'eta_revised',p_reason);
 return 'updated';
end $$;
create or replace function public.track_order_progress() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.status,new.rider_id,new.arrived_at,new.arrival_eta_at,new.confirmed_at) is distinct from
    (old.status,old.rider_id,old.arrived_at,old.arrival_eta_at,old.confirmed_at) then
  new.progress_at=clock_timestamp();
 end if;
 -- A release/reassignment must not retain a former rider's revised ETA.
 if new.status in ('pending','awaiting_charge') and (new.status,new.rider_id) is distinct from (old.status,old.rider_id) then new.arrival_eta_at=null;new.delay_reason=null;end if;
 return new;
end $$;
drop trigger if exists orders_track_progress on public.orders;
create trigger orders_track_progress before update on public.orders for each row execute function public.track_order_progress();

create table if not exists public.admin_activity (
 id uuid primary key default gen_random_uuid(),actor_id uuid,action text not null,entity text not null,entity_id text,
 before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
alter table public.admin_activity enable row level security;
revoke all on public.admin_activity from public,anon,authenticated;
grant select on public.admin_activity to authenticated;
drop policy if exists admin_activity_read on public.admin_activity;
create policy admin_activity_read on public.admin_activity for select to authenticated using(public.is_admin());
create index if not exists admin_activity_created on public.admin_activity(created_at desc,id);
create or replace function public.audit_owner_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_json jsonb;after_json jsonb;allowed text[];
begin
 allowed=case tg_table_name
 when 'menu_items' then array['id','name','base_price','is_available','is_deleted','category_id','sort_order']
 when 'item_sizes' then array['id','item_id','label','price','sort_order']
 when 'riders' then array['user_id','name','active']
 when 'categories' then array['id','name','sort_order']
 else array['id','tiers','enabled','opens_at','closes_at','paused','wait_minutes','cancel_rate_threshold','pending_alert_minutes','stalled_alert_minutes'] end;
 if tg_op<>'INSERT' then select jsonb_object_agg(key,value) into before_json from jsonb_each(to_jsonb(old)) where key=any(allowed);end if;
 if tg_op<>'DELETE' then select jsonb_object_agg(key,value) into after_json from jsonb_each(to_jsonb(new)) where key=any(allowed);end if;
 if before_json is distinct from after_json then
 insert into public.admin_activity(actor_id,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),tg_op,tg_table_name,coalesce(after_json->>'id',after_json->>'user_id',before_json->>'id',before_json->>'user_id'),before_json,after_json);
 end if;
 return coalesce(new,old);
end $$;
do $$ declare name text;begin
 foreach name in array array['menu_items','item_sizes','categories','delivery_rates','ordering_hours','delivery_settings','riders'] loop
  execute format('drop trigger if exists owner_change_audit on public.%I',name);
  execute format('create trigger owner_change_audit after insert or update or delete on public.%I for each row execute function public.audit_owner_change()',name);
 end loop;
end $$;

-- Only totals survive deletion. No UUIDs, items, contact details or addresses are archived.
create table if not exists public.archived_monthly_sales (
 month date primary key,orders bigint not null default 0,delivered bigint not null default 0,cancelled bigint not null default 0,
 food_sales bigint not null default 0,delivery_charges bigint not null default 0,total_sales bigint not null default 0
);
alter table public.archived_monthly_sales enable row level security;
revoke all on public.archived_monthly_sales from public,anon,authenticated;
grant select on public.archived_monthly_sales to authenticated;
drop policy if exists archived_sales_admin_read on public.archived_monthly_sales;
create policy archived_sales_admin_read on public.archived_monthly_sales for select to authenticated using(public.is_admin());
create or replace function public.archive_deleted_order_sales() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status in ('delivered','cancelled','declined') then
 insert into public.archived_monthly_sales as a(month,orders,delivered,cancelled,food_sales,delivery_charges,total_sales)
 values(date_trunc('month',old.created_at at time zone 'Asia/Karachi')::date,1,(old.status='delivered')::int,(old.status in ('cancelled','declined'))::int,
 case when old.status='delivered' then old.subtotal else 0 end,case when old.status='delivered' then coalesce(old.delivery_charge,0) else 0 end,
 case when old.status='delivered' then old.subtotal+coalesce(old.delivery_charge,0) else 0 end)
 on conflict(month) do update set orders=a.orders+excluded.orders,delivered=a.delivered+excluded.delivered,cancelled=a.cancelled+excluded.cancelled,
 food_sales=a.food_sales+excluded.food_sales,delivery_charges=a.delivery_charges+excluded.delivery_charges,total_sales=a.total_sales+excluded.total_sales;
 end if;return old;
end $$;
drop trigger if exists orders_archive_sales on public.orders;
create trigger orders_archive_sales before delete on public.orders for each row execute function public.archive_deleted_order_sales();
create or replace function public.admin_monthly_sales() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by month desc) from (
 select month,sum(orders) as orders,sum(delivered) as delivered,sum(cancelled) as cancelled,sum(food_sales) as food_sales,sum(delivery_charges) as delivery_charges,sum(total_sales) as total_sales
 from (
 select * from public.archived_monthly_sales union all
 select date_trunc('month',created_at at time zone 'Asia/Karachi')::date,count(*),count(*) filter(where status='delivered'),count(*) filter(where status in ('cancelled','declined')),
 coalesce(sum(subtotal) filter(where status='delivered'),0),coalesce(sum(delivery_charge) filter(where status='delivered'),0),coalesce(sum(subtotal+coalesce(delivery_charge,0)) filter(where status='delivered'),0)
 from public.orders group by 1
 ) z group by month order by month desc limit 120) x),'[]'::jsonb);
end $$;
do $$declare f text;begin
 foreach f in array array['revise_order_eta(uuid,integer,text)','admin_monthly_sales()'] loop
 execute 'revoke all on function public.'||f||' from public,anon';execute 'grant execute on function public.'||f||' to authenticated';end loop;
end $$;
revoke all on function public.track_order_progress(),public.audit_owner_change(),public.archive_deleted_order_sales() from public,anon,authenticated;
grant all on public.admin_activity,public.archived_monthly_sales to service_role;
commit;
