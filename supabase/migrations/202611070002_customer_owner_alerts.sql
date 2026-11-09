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
