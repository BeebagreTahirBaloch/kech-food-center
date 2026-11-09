# SQL review: customer, owner and rider updates

Run the two migration files from OPERATIONS_SETUP_20261107.md in order. The complete definitions below include every new/replaced RLS policy, index, function, grant and trigger. They do not modify supabase/schema.sql or add kitchen controls.

Policies: `admin_activity_read`, `archived_sales_admin_read`, `push_own_read`, `push_own_delete`. Customer subscriptions and notification jobs have RLS enabled with no browser policies; only the server service role can access them.

Indexes: `admin_activity_created`, `customer_push_order`, `notification_jobs_due`. Primary keys and uniqueness constraints also create their normal backing indexes.

Functions: `rider_availability`, `revise_order_eta`, `track_order_progress`, `audit_owner_change`, `archive_deleted_order_sales`, `admin_monthly_sales`, `save_push_subscription`, `customer_push_registration`, `queue_order_notifications`, `claim_notification_jobs`.

```sql
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

begin;
alter table public.delivery_settings add column if not exists stalled_alert_minutes int not null default 20;
alter table public.delivery_settings drop constraint if exists settings_stalled_alert_check;
alter table public.delivery_settings add constraint settings_stalled_alert_check check(stalled_alert_minutes between 5 and 120);

-- Owner subscriptions reuse the existing authenticated subscription store.
drop policy if exists push_own_read on public.push_subscriptions;
create policy push_own_read on public.push_subscriptions for select to authenticated using((public.is_rider() or public.is_admin()) and user_id=auth.uid());
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions for delete to authenticated using((public.is_rider() or public.is_admin()) and user_id=auth.uid());
create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not (coalesce(public.is_rider(),false) or coalesce(public.is_admin(),false)) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-zA-Z0-9.-]+\.push.apple.com|web.push.apple.com|[a-zA-Z0-9.-]+\.notify.windows.com)/' or length(p_endpoint)>2048 or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{20,30}={0,2}$' then raise exception 'Unsupported push subscription';end if;
 if (select count(*) from public.push_subscriptions where user_id=auth.uid())>=10 and not exists(select 1 from public.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid()) then raise exception 'Remove an old alert device first';end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) values(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_user_agent,300))
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,last_seen_at=now(),user_agent=excluded.user_agent where public.push_subscriptions.user_id=auth.uid();
 if not found then raise exception 'Subscription belongs to another account';end if;
end $$;

create table if not exists public.customer_push_subscriptions (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
 endpoint text not null,p256dh text not null,auth text not null,owner_hash text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null,unique(order_id,endpoint)
);
alter table public.customer_push_subscriptions enable row level security;
revoke all on public.customer_push_subscriptions from public,anon,authenticated;
create index if not exists customer_push_order on public.customer_push_subscriptions(order_id,expires_at);
-- Edge-only checked function: order UUID is the existing single-order tracking capability.
create or replace function public.customer_push_registration(p_order uuid,p_endpoint text,p_key text,p_auth text,p_owner_hash text,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if p_owner_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$' or p_action not in ('save','remove','status') or p_action is null then raise exception 'Invalid registration';end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found';end if;
 if p_action='remove' then delete from public.customer_push_subscriptions where order_id=p_order and endpoint=p_endpoint and owner_hash=p_owner_hash;return false;end if;
 if p_action='status' then return exists(select 1 from public.customer_push_subscriptions where order_id=p_order and endpoint=p_endpoint and owner_hash=p_owner_hash and expires_at>now());end if;
 if o.status in ('delivered','cancelled','declined') or o.created_at<now()-interval '7 days' then raise exception 'Alerts are available only for active recent orders';end if;
 if p_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-zA-Z0-9.-]+\.push.apple.com|web.push.apple.com|[a-zA-Z0-9.-]+\.notify.windows.com)/' or length(p_endpoint)>2048 or p_key !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{20,30}={0,2}$' or p_key is null or p_auth is null then raise exception 'Invalid subscription';end if;
 delete from public.customer_push_subscriptions where expires_at<now();
 if (select count(*) from public.customer_push_subscriptions where order_id=p_order)>=5 and not exists(select 1 from public.customer_push_subscriptions where order_id=p_order and endpoint=p_endpoint) then raise exception 'This order has reached its alert device limit';end if;
 insert into public.customer_push_subscriptions(order_id,endpoint,p256dh,auth,owner_hash,expires_at) values(p_order,p_endpoint,p_key,p_auth,p_owner_hash,o.created_at+interval '7 days')
 on conflict(order_id,endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth where public.customer_push_subscriptions.owner_hash=excluded.owner_hash;
 if not found then raise exception 'Subscription belongs to another browser';end if;
 return true;
end $$;

create table if not exists public.notification_jobs (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
 audience text not null check(audience in ('customer','owner')),event text not null,event_key text unique not null,
 progress_at timestamptz not null,due_at timestamptz not null default now(),claimed_at timestamptz,finished_at timestamptz,attempts int not null default 0
);
alter table public.notification_jobs enable row level security;
revoke all on public.notification_jobs from public,anon,authenticated;
create index if not exists notification_jobs_due on public.notification_jobs(due_at) where finished_at is null;
create or replace function public.queue_order_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare event_name text;version text;pending_minutes int;stalled_minutes int;
begin
 select pending_alert_minutes,stalled_alert_minutes into pending_minutes,stalled_minutes from public.delivery_settings where id;
 version=new.id::text||':'||new.progress_at::text||':'||new.status||':'||coalesce(new.rider_id::text,'');
 if tg_op='INSERT' then
  insert into public.notification_jobs(order_id,audience,event,event_key,progress_at) values(new.id,'owner','new',new.id::text||':new',new.progress_at) on conflict do nothing;
 elsif (new.status,new.rider_id,new.arrived_at,new.arrival_eta_at) is distinct from (old.status,old.rider_id,old.arrived_at,old.arrival_eta_at) then
  event_name=case when new.status in ('cancelled','declined') then 'cancelled' when new.status='delivered' then 'delivered'
   when new.arrived_at is not null and old.arrived_at is null then 'arrived'
   when new.status='out_for_delivery' and old.status<>'out_for_delivery' then 'on_way'
   when new.rider_id is not null and new.rider_id is distinct from old.rider_id then 'accepted'
   when new.status='confirmed' and old.status<>'confirmed' then 'confirmed'
   when new.arrival_eta_at is distinct from old.arrival_eta_at and new.arrival_eta_at is not null then 'eta' end;
  if event_name is not null then insert into public.notification_jobs(order_id,audience,event,event_key,progress_at) values(new.id,'customer',event_name,version||':'||event_name,new.progress_at) on conflict do nothing;end if;
 end if;
 if tg_op='INSERT' or new.progress_at is distinct from old.progress_at then
  if new.status='pending' and new.rider_id is null then
   insert into public.notification_jobs(order_id,audience,event,event_key,progress_at,due_at) values(new.id,'owner','waiting',version||':waiting',new.progress_at,now()+make_interval(mins=>coalesce(pending_minutes,10))) on conflict do nothing;
  elsif new.status not in ('delivered','cancelled','declined') then
   insert into public.notification_jobs(order_id,audience,event,event_key,progress_at,due_at) values(new.id,'owner','stalled',version||':stalled',new.progress_at,greatest(now()+make_interval(mins=>coalesce(stalled_minutes,20)),coalesce(new.arrival_eta_at,new.confirmed_at+make_interval(mins=>new.eta_minutes)))) on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists orders_queue_notifications on public.orders;
create trigger orders_queue_notifications after insert or update on public.orders for each row execute function public.queue_order_notifications();
create or replace function public.claim_notification_jobs() returns setof public.notification_jobs language plpgsql security definer set search_path='' as $$
begin
 -- Expired backup preparations are private but should not remain indefinitely.
 delete from public.order_cleanup_batches where created_at<now()-interval '1 hour';
 delete from public.customer_push_subscriptions where expires_at<now();
 delete from public.notification_jobs where finished_at<now()-interval '7 days';
 return query update public.notification_jobs set claimed_at=now(),attempts=attempts+1 where id in (
 select id from public.notification_jobs where finished_at is null and due_at<=now() and attempts<5 and (claimed_at is null or claimed_at<now()-interval '2 minutes') order by due_at limit 5 for update skip locked) returning *;
end $$;
-- Seed future overdue alerts for orders already active at installation (no old customer alerts).
insert into public.notification_jobs(order_id,audience,event,event_key,progress_at,due_at)
select o.id,'owner',case when status='pending' then 'waiting' else 'stalled' end,o.id::text||':initial-overdue',progress_at,
greatest(now(),progress_at+make_interval(mins=>case when status='pending' then s.pending_alert_minutes else s.stalled_alert_minutes end),case when status<>'pending' then coalesce(arrival_eta_at,confirmed_at+make_interval(mins=>eta_minutes)) end)
from public.orders o cross join public.delivery_settings s where s.id and status not in ('delivered','cancelled','declined') on conflict do nothing;
revoke all on function public.customer_push_registration(uuid,text,text,text,text,text),public.queue_order_notifications(),public.claim_notification_jobs() from public,anon,authenticated;
grant execute on function public.customer_push_registration(uuid,text,text,text,text,text),public.claim_notification_jobs() to service_role;
grant all on public.customer_push_subscriptions,public.notification_jobs to service_role;
commit;
```

