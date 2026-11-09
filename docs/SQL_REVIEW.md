# New SQL security and function review

Run the migration files in order as documented in DEPLOYMENT.md. Complete definitions below are for review, not a substitute migration. Primary-key and UNIQUE constraints in the tables create their corresponding implicit indexes.

## 202611010001_delivery_estimate.sql

### Tables (including implicit indexes)

None.

### RLS policies

None.

### Explicit indexes

None.

### Database functions

None.

Column additions, grants/revokes, trigger replacement and scheduling statements remain in the migration file.

## 202611010002_rider_operations.sql

### Tables (including implicit indexes)

```sql
create table if not exists public.riders (
 user_id uuid primary key references auth.users(id), name text not null check(length(name) between 2 and 80),
 phone text not null check(length(phone) between 7 and 20), active boolean not null default true,
 online boolean not null default false, created_at timestamptz not null default now()
);
```

```sql
create table if not exists public.delivery_settings (
 id boolean primary key default true check(id), wait_minutes int not null default 10 check(wait_minutes between 1 and 120),
 cancel_rate_threshold numeric not null default 20 check(cancel_rate_threshold between 0 and 100)
);
```

```sql
create table if not exists public.order_events (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 actor_id uuid, event text not null, reason text, created_at timestamptz not null default now()
);
```

```sql
create table if not exists public.call_attempts (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 rider_id uuid not null references public.riders(user_id),created_at timestamptz not null default now()
);
```

### RLS policies

```sql
create policy riders_self_or_admin on public.riders for select to authenticated using(user_id=auth.uid() or public.is_admin());
```

```sql
create policy orders_rider_safe_read on public.orders for select to authenticated using(public.is_rider() and (status='pending' or rider_id=auth.uid()));
```

```sql
create policy settings_admin on public.delivery_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
```

```sql
create policy events_admin_read on public.order_events for select to authenticated using(public.is_admin());
```

```sql
create policy calls_owner_admin_read on public.call_attempts for select to authenticated using(public.is_admin() or (public.is_rider() and rider_id=auth.uid() and exists(select 1 from public.orders o where o.id=order_id and o.rider_id=auth.uid() and o.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery'))));
```

```sql
create policy rider_orders_broadcast_read on realtime.messages for select to authenticated using(realtime.topic()='rider-orders' and public.is_rider());
```

### Explicit indexes

```sql
create unique index if not exists orders_one_active_rider on public.orders(rider_id)
 where rider_id is not null and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery');
```

```sql
create index if not exists orders_rider_history on public.orders(rider_id,created_at desc);
```

```sql
create index if not exists orders_pending_created on public.orders(created_at desc) where status='pending';
```

```sql
create index if not exists order_events_order_time on public.order_events(order_id,created_at);
```

```sql
create index if not exists call_attempts_order_time on public.call_attempts(order_id,created_at);
```

### Database functions

```sql
create or replace function public.is_rider() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.riders where user_id=auth.uid() and active) and not coalesce(public.is_admin(),false)
$$;
```

```sql
create or replace function public.set_rider_online(p_online boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.riders set online=p_online where user_id=auth.uid();
end $$;
```

```sql
create or replace function public.accept_order(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 perform pg_advisory_xact_lock(710011);
 if exists(select 1 from public.orders where rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) then return 'you_have_an_active_order'; end if;
 update public.orders set rider_id=auth.uid(),accepted_at=now(),status='awaiting_charge' where id=order_id and status='pending' and rider_id is null;
 if not found then return 'already_taken'; end if;
 return 'accepted';
exception when unique_violation then return 'you_have_an_active_order';
end $$;
```

```sql
create or replace function public.set_quote(order_id uuid,charge int,minutes int) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 if charge not in (0,100,150,200,300,400,500) or minutes not in (30,60,120) or charge is null or minutes is null then raise exception 'Invalid charge or time'; end if;
 update public.orders set delivery_charge=charge,total=subtotal+charge,eta_minutes=minutes,confirmed_at=now(),status='confirmed' where id=order_id and rider_id=auth.uid() and status='awaiting_charge';
 return case when found then 'updated' else 'Order already changed' end;
end $$;
```

```sql
create or replace function public.mark_out_for_delivery(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 update public.orders set status='out_for_delivery',out_for_delivery_at=now() where id=order_id and rider_id=auth.uid() and status in ('confirmed','preparing');
 return case when found then 'updated' else 'Order already changed' end;
end $$;
```

```sql
create or replace function public.mark_delivered(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 update public.orders set status='delivered',delivered_at=now() where id=order_id and rider_id=auth.uid() and status='out_for_delivery';
 return case when found then 'updated' else 'Order already changed' end;
end $$;
```

```sql
create or replace function public.mark_arrived(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 update public.orders set arrived_at=coalesce(arrived_at,now()) where id=order_id and rider_id=auth.uid() and status='out_for_delivery';
 return case when found then 'updated' else 'Order already changed' end;
end $$;
```

```sql
create or replace function public.log_call_attempt(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 perform 1 from public.orders where id=order_id and rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') for update;
 if not found then return 'Order already changed'; end if;
 insert into public.call_attempts(order_id,rider_id) values(order_id,auth.uid());
 return 'updated';
end $$;
```

```sql
create or replace function public.rider_cancel_order(order_id uuid,reason text,note text default '') returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; wait_for int; remaining int;
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 select * into o from public.orders where id=order_id and rider_id=auth.uid() for update;
 if not found or o.status<>'out_for_delivery' then return 'Order already changed'; end if;
 if reason is null or reason not in ('no_answer','wrong_address','customer_refused','other') or length(coalesce(note,''))>500 or (reason='other' and length(trim(coalesce(note,'')))=0) then return 'Choose a reason and add a note for other'; end if;
 if not exists(select 1 from public.call_attempts c where c.order_id=o.id and c.rider_id=auth.uid() and c.created_at>=o.accepted_at) then return 'Call the customer first'; end if;
 if o.arrived_at is null then return 'Mark arrived first'; end if;
 select wait_minutes into wait_for from public.delivery_settings where id;
 remaining:=ceil(extract(epoch from (greatest(o.arrived_at,o.customer_here_at)+make_interval(mins=>wait_for)-now()))/60);
 if remaining>0 then return 'Wait '||remaining||' more minutes'; end if;
 update public.orders set status='cancelled',cancelled_at=now(),cancelled_by='rider',cancel_reason=reason,cancel_note=trim(note) where id=o.id;
 return 'cancelled';
end $$;
```

```sql
create or replace function public.customer_here(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; wait_for int;
begin
 select * into o from public.orders where id=order_id for update;
 if not found or o.status<>'out_for_delivery' or o.arrived_at is null then return 'Order already changed'; end if;
 if o.customer_here_used or o.customer_here_at is not null then return 'Already recorded'; end if;
 select wait_minutes into wait_for from public.delivery_settings where id;
 if now()>o.arrived_at+make_interval(mins=>wait_for) then return 'Wait time has ended'; end if;
 update public.orders set customer_here_at=now(),customer_here_used=true where id=o.id;
 return 'updated';
end $$;
```

```sql
create or replace function public.release_order(order_id uuid,reason text) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(trim(coalesce(reason,''))) not between 3 and 500 then raise exception 'Enter a release reason'; end if;
 perform pg_advisory_xact_lock(710011);
 update public.orders set status='pending',rider_id=null,accepted_at=null,delivery_charge=null,total=null,eta_minutes=null,confirmed_at=null,out_for_delivery_at=null,arrived_at=null,customer_here_at=null,released_at=now()
 where id=order_id and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery');
 if not found then return 'Order already changed'; end if;
 insert into public.order_events(order_id,actor_id,event,reason) values(order_id,auth.uid(),'released',trim(reason));
 return 'released';
end $$;
```

```sql
create or replace function public.reassign_order(order_id uuid,new_rider uuid,reason text) returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(710011);
 if not exists(select 1 from public.riders r where user_id=new_rider and active and not exists(select 1 from public.admins a where a.user_id=r.user_id)) then return 'not_authorized'; end if;
 if exists(select 1 from public.orders where rider_id=new_rider and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery')) then return 'you_have_an_active_order'; end if;
 result:=public.release_order(order_id,reason); if result<>'released' then return result; end if;
 update public.orders set rider_id=new_rider,accepted_at=now(),status='awaiting_charge' where id=order_id;
 insert into public.order_events(order_id,actor_id,event,reason) values(order_id,auth.uid(),'reassigned',new_rider::text||': '||reason);
 return 'reassigned';
exception when unique_violation then return 'you_have_an_active_order';
end $$;
```

```sql
create or replace function public.rider_dashboard(history_page int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 select jsonb_build_object(
 'profile',(select to_jsonb(r) from public.riders r where user_id=auth.uid()),
 'pending',coalesce((select jsonb_agg(x) from (select id,items,subtotal,distance_km,estimated_delivery_charge,lat,lng,created_at from public.orders where status='pending' and rider_id is null order by created_at limit 100) x),'[]'::jsonb),
 'active',(select to_jsonb(o)||jsonb_build_object('call_count',(select count(*) from public.call_attempts c where c.order_id=o.id and c.rider_id=auth.uid() and c.created_at>=o.accepted_at)) from public.orders o where rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') limit 1),
 'history',coalesce((select jsonb_agg(x) from (select * from public.orders where rider_id=auth.uid() and status in ('delivered','cancelled') order by created_at desc limit 25 offset greatest(history_page,0)*25) x),'[]'::jsonb),
 'today',(select jsonb_build_object('delivered',count(*),'charges',coalesce(sum(delivery_charge),0),'sales',coalesce(sum(total),0)) from public.orders where rider_id=auth.uid() and status='delivered' and delivered_at>=date_trunc('day',now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'),
 'wait_minutes',(select wait_minutes from public.delivery_settings where id)
 ) into result;
 return result;
end $$;
```

```sql
create or replace function public.broadcast_rider_orders() returns trigger language plpgsql security definer set search_path='' as $$
begin perform realtime.send('{}'::jsonb,'changed','rider-orders',true); return new; end $$;
```

```sql
create or replace function public.broadcast_order_tracking_update() returns trigger language plpgsql security definer set search_path='' as $$
begin perform realtime.send(jsonb_build_object('id',new.id),'order_update','order:'||new.id::text,false); return new; end $$;
```

Column additions, grants/revokes, trigger replacement and scheduling statements remain in the migration file.

## 202611010003_rider_reports.sql

### Tables (including implicit indexes)

None.

### RLS policies

None.

### Explicit indexes

None.

### Database functions

```sql
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
```

Column additions, grants/revokes, trigger replacement and scheduling statements remain in the migration file.

## 202611010004_rider_push.sql

### Tables (including implicit indexes)

```sql
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null, p256dh text not null, auth text not null,
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), user_agent text
);
```

```sql
create table if not exists public.order_push_jobs (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 kind text not null check(kind in ('new','reminder')), due_at timestamptz not null,
 claimed_at timestamptz, finished_at timestamptz, attempts int not null default 0,
 unique(order_id,kind)
);
```

### RLS policies

```sql
create policy push_own_read on public.push_subscriptions for select to authenticated using(public.is_rider() and user_id=auth.uid());
```

```sql
create policy push_own_delete on public.push_subscriptions for delete to authenticated using(public.is_rider() and user_id=auth.uid());
```

### Explicit indexes

```sql
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
```

```sql
create index if not exists order_push_jobs_due on public.order_push_jobs(due_at) where finished_at is null;
```

### Database functions

```sql
create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 -- Restrict outgoing requests to browser push providers; never arbitrary URLs.
 if p_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-zA-Z0-9.-]+\.push.apple.com|web.push.apple.com|[a-zA-Z0-9.-]+\.notify.windows.com)/' or length(p_endpoint)>2048 or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{20,30}={0,2}$' then raise exception 'Unsupported push subscription'; end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) values(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_user_agent,300))
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,last_seen_at=now(),user_agent=excluded.user_agent where public.push_subscriptions.user_id=auth.uid();
 if not found then raise exception 'Subscription belongs to another account'; end if;
end $$;
```

```sql
create or replace function public.enqueue_order_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' then
 insert into public.order_push_jobs(order_id,kind,due_at) values(new.id,'new',now()),(new.id,'reminder',now()+interval '2 minutes') on conflict do nothing;
 end if;
 return new;
end $$;
```

```sql
create or replace function public.claim_push_jobs() returns setof public.order_push_jobs language sql security definer set search_path='' as $$
 update public.order_push_jobs set claimed_at=now(),attempts=attempts+1 where id in (
 select id from public.order_push_jobs where finished_at is null and due_at<=now() and attempts<3 and (claimed_at is null or claimed_at<now()-interval '5 minutes') order by due_at limit 10 for update skip locked
 ) returning *;
$$;
```

Column additions, grants/revokes, trigger replacement and scheduling statements remain in the migration file.

## 202611010005_push_schedule.sql

### Tables (including implicit indexes)

None.

### RLS policies

None.

### Explicit indexes

None.

### Database functions

None.

Column additions, grants/revokes, trigger replacement and scheduling statements remain in the migration file.

## 202611010006_rider_cancel_after_accept.sql

No new RLS policies or indexes. Replaces the checked rider cancellation function:

```sql
begin;
create or replace function public.rider_cancel_order(order_id uuid,reason text,note text default '') returns text
language plpgsql security definer set search_path='' as $$
declare o public.orders; wait_for int; remaining int;
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 select * into o from public.orders where id=order_id and rider_id=auth.uid() for update;
 if not found or o.status not in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') then return 'Order already changed'; end if;
 if reason is null or reason not in ('no_answer','wrong_address','customer_refused','other') or length(coalesce(note,''))>500 or (reason='other' and length(trim(coalesce(note,'')))=0) then return 'Choose a reason and add a note for other'; end if;
 if reason='no_answer' then
  if not exists(select 1 from public.call_attempts c where c.order_id=o.id and c.rider_id=auth.uid() and c.created_at>=o.accepted_at) then return 'Call the customer first'; end if;
  if o.arrived_at is not null then
   select wait_minutes into wait_for from public.delivery_settings where id;
   remaining:=ceil(extract(epoch from (greatest(o.arrived_at,o.customer_here_at)+make_interval(mins=>wait_for)-now()))/60);
   if remaining>0 then return 'Wait '||remaining||' more minutes'; end if;
  end if;
 end if;
 update public.orders set status='cancelled',cancelled_at=now(),cancelled_by='rider',cancel_reason=reason,cancel_note=trim(coalesce(note,'')) where id=o.id;
 return 'cancelled';
end $$;
revoke all on function public.rider_cancel_order(uuid,text,text) from public,anon;
grant execute on function public.rider_cancel_order(uuid,text,text) to authenticated;
commit;

```

## Pending-order cancellation repair (007)

New RLS policies: none. New indexes: none. New database functions: none. Replaces only the total/status constraint.

```sql
begin;

-- Replace legacy total/status checks without changing orders or access policies.
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mstatus\M'
      and pg_get_constraintdef(oid) ~ '\mtotal\M'
  loop
    execute format('alter table public.orders drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.orders add constraint orders_tracking_total_check check (
  (status in ('pending', 'awaiting_charge', 'declined') and total is null)
  or (status in ('quoted', 'confirmed', 'preparing', 'out_for_delivery', 'delivered')
      and delivery_charge is not null and total is not null
      and total = subtotal + delivery_charge)
  or (status = 'cancelled'
      and (total is null or (delivery_charge is not null and total = subtotal + delivery_charge)))
);

commit;

```

## Customer ordering hours

Policy: `ordering_hours_admin`. Functions: `ordering_status()` and `enforce_ordering_hours()`. Trigger: `orders_check_opening_hours`. Index: only the new table primary-key index (`ordering_hours_pkey`). No orders policies or existing data are changed. Full definitions:

```sql
begin;
create table if not exists public.ordering_hours (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 opens_at time not null default '12:00',
 closes_at time not null default '23:00',
 check(opens_at <> closes_at)
);
insert into public.ordering_hours(id) values(true) on conflict do nothing;
alter table public.ordering_hours enable row level security;
revoke all on public.ordering_hours from anon,authenticated;
grant select,update on public.ordering_hours to authenticated;
drop policy if exists ordering_hours_admin on public.ordering_hours;
create policy ordering_hours_admin on public.ordering_hours for all to authenticated
 using(public.is_admin()) with check(public.is_admin());

create or replace function public.ordering_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'opensAt',to_char(opens_at,'HH24:MI'),
 'closesAt',to_char(closes_at,'HH24:MI'),'timezone','Asia/Karachi',
 'isOpen',not enabled or case when opens_at < closes_at
 then (statement_timestamp() at time zone 'Asia/Karachi')::time >= opens_at
  and (statement_timestamp() at time zone 'Asia/Karachi')::time < closes_at
 else (statement_timestamp() at time zone 'Asia/Karachi')::time >= opens_at
  or (statement_timestamp() at time zone 'Asia/Karachi')::time < closes_at end)
 from public.ordering_hours where id
$$;
revoke all on function public.ordering_status() from public;
grant execute on function public.ordering_status() to anon,authenticated,service_role;

create or replace function public.enforce_ordering_hours() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce((public.ordering_status()->>'isOpen')::boolean,false) then
  raise exception 'Ordering is currently closed. Please order during opening hours.' using errcode='P0001';
 end if;
 return new;
end $$;
revoke all on function public.enforce_ordering_hours() from public,anon,authenticated;
drop trigger if exists orders_check_opening_hours on public.orders;
create trigger orders_check_opening_hours before insert on public.orders
 for each row execute function public.enforce_ordering_hours();
commit;

```

## Stop ordering switch
No new policies or indexes. Replaces `ordering_status()`; existing insert trigger enforces the pause.
```sql
begin;
alter table public.ordering_hours add column if not exists paused boolean not null default false;
create or replace function public.ordering_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'paused',paused,'opensAt',to_char(opens_at,'HH24:MI'),
 'closesAt',to_char(closes_at,'HH24:MI'),'timezone','Asia/Karachi',
 'isOpen',not paused and (not enabled or case when opens_at < closes_at
 then (statement_timestamp() at time zone 'Asia/Karachi')::time >= opens_at
  and (statement_timestamp() at time zone 'Asia/Karachi')::time < closes_at
 else (statement_timestamp() at time zone 'Asia/Karachi')::time >= opens_at
  or (statement_timestamp() at time zone 'Asia/Karachi')::time < closes_at end))
 from public.ordering_hours where id
$$;
revoke all on function public.ordering_status() from public;
grant execute on function public.ordering_status() to anon,authenticated,service_role;

commit;

```

## Admin-controlled delivery rates
Policies: delivery_rates_read, delivery_rates_admin_update. New index: delivery_rates_pkey (implicit primary key). Functions: delivery_charge_for_distance(numeric), lock_delivery_rate(), replacement set_quote(uuid,integer,integer). Trigger: orders_lock_delivery_rate. Full definitions:
```sql
begin;
create table if not exists public.delivery_rates (
 id boolean primary key default true check(id),
 first_km numeric not null default 5 check(first_km>0),
 second_km numeric not null default 8 check(second_km>first_km),
 first_charge integer not null default 100 check(first_charge between 0 and 10000),
 second_charge integer not null default 150 check(second_charge between 0 and 10000),
 final_charge integer not null default 300 check(final_charge between 0 and 10000)
);
insert into public.delivery_rates(id) values(true) on conflict do nothing;
alter table public.delivery_rates enable row level security;
revoke all on public.delivery_rates from anon,authenticated;
grant select on public.delivery_rates to anon,authenticated;
grant update on public.delivery_rates to authenticated;
drop policy if exists delivery_rates_read on public.delivery_rates;
create policy delivery_rates_read on public.delivery_rates for select to anon,authenticated using(true);
drop policy if exists delivery_rates_admin_update on public.delivery_rates;
create policy delivery_rates_admin_update on public.delivery_rates for update to authenticated using(public.is_admin()) with check(public.is_admin());
create or replace function public.delivery_charge_for_distance(km numeric) returns integer
language plpgsql stable security definer set search_path='' as $$
declare rates public.delivery_rates;
begin
 if km is null or km<0 or km::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid distance'; end if;
 select * into strict rates from public.delivery_rates where id;
 return case when km<=rates.first_km then rates.first_charge when km<=rates.second_km then rates.second_charge else rates.final_charge end;
end $$;
revoke all on function public.delivery_charge_for_distance(numeric) from public;
grant execute on function public.delivery_charge_for_distance(numeric) to anon,authenticated,service_role;
alter table public.orders add column if not exists delivery_rate_locked boolean not null default false;
-- Replace only charge/total checks, preserving status validation and all RLS.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.orders'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '\mdelivery_charge\M' loop
 execute format('alter table public.orders drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.orders add constraint orders_delivery_charge_check check(delivery_charge is null or delivery_charge>=0);
alter table public.orders add constraint orders_tracking_total_check check(
 (status in ('pending','awaiting_charge','declined') and ((not delivery_rate_locked and total is null) or (delivery_rate_locked and delivery_charge is not null and total is not null and total=subtotal+delivery_charge)))
 or (status in ('quoted','confirmed','preparing','out_for_delivery','delivered') and delivery_charge is not null and total is not null and total=subtotal+delivery_charge)
 or (status='cancelled' and (total is null or (delivery_charge is not null and total=subtotal+delivery_charge)))
);
create or replace function public.lock_delivery_rate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.delivery_rate_locked and new.delivery_charge is distinct from public.delivery_charge_for_distance(new.distance_km) then
   raise exception 'Delivery rates changed. Refresh the delivery charge before ordering.' using errcode='P0002';
  end if;
 elsif old.delivery_rate_locked then
  new.delivery_rate_locked:=true;
  new.delivery_charge:=old.delivery_charge;
  new.total:=new.subtotal+old.delivery_charge;
 end if;
 return new;
end $$;
revoke all on function public.lock_delivery_rate() from public,anon,authenticated;
drop trigger if exists orders_lock_delivery_rate on public.orders;
create trigger orders_lock_delivery_rate before insert or update on public.orders for each row execute function public.lock_delivery_rate();
-- Preserve the existing signature for older clients, but never accept a rider-supplied charge.
create or replace function public.set_quote(order_id uuid,charge int,minutes int) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; saved_charge int;
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 if minutes is null or minutes not in (30,60,120) then raise exception 'Invalid delivery time'; end if;
 select * into o from public.orders where id=order_id and rider_id=auth.uid() for update;
 if not found or o.status<>'awaiting_charge' then return 'Order already changed'; end if;
 saved_charge:=coalesce(o.delivery_charge,o.estimated_delivery_charge,public.delivery_charge_for_distance(o.distance_km));
 update public.orders set delivery_charge=saved_charge,total=subtotal+saved_charge,eta_minutes=minutes,confirmed_at=now(),status='confirmed' where id=o.id;
 return 'updated';
end $$;
revoke all on function public.set_quote(uuid,integer,integer) from public,anon;
grant execute on function public.set_quote(uuid,integer,integer) to authenticated;
commit;

```

## Flexible delivery ranges
No new policies or indexes. Existing delivery_rates_read and delivery_rates_admin_update policies remain. Function validate_delivery_tiers() and trigger delivery_rates_validate_tiers validate the entire saved list. Function delivery_charge_for_distance(numeric) is replaced.
```sql
begin;
alter table public.delivery_rates add column if not exists tiers jsonb;
update public.delivery_rates set tiers=jsonb_build_array(
 jsonb_build_object('maxKm',first_km,'charge',first_charge),
 jsonb_build_object('maxKm',second_km,'charge',second_charge),
 jsonb_build_object('maxKm',null,'charge',final_charge)) where tiers is null;
alter table public.delivery_rates alter column tiers set not null;
create or replace function public.validate_delivery_tiers() returns trigger
language plpgsql set search_path='' as $$
declare band jsonb; previous_km numeric:=0; limit_km numeric; fee numeric; position int:=0; count_bands int;
begin
 if jsonb_typeof(new.tiers)<>'array' then raise exception 'Delivery rates must be a list'; end if;
 count_bands:=jsonb_array_length(new.tiers);
 if count_bands<1 then raise exception 'Add at least one delivery rate'; end if;
 for band in select value from jsonb_array_elements(new.tiers) loop
  position:=position+1;
  if jsonb_typeof(band)<>'object' or not (band ? 'maxKm') or jsonb_typeof(band->'charge') is distinct from 'number' then raise exception 'Invalid delivery rate'; end if;
  fee:=(band->>'charge')::numeric;
  if fee<0 or fee>10000 or fee<>trunc(fee) then raise exception 'Charges must be whole rupees from 0 to 10000'; end if;
  if position=count_bands then
   if band->'maxKm'<>'null'::jsonb then raise exception 'The final range must cover all remaining distances'; end if;
  else
   if jsonb_typeof(band->'maxKm') is distinct from 'number' then raise exception 'Enter a kilometre limit'; end if;
   limit_km:=(band->>'maxKm')::numeric;
   if limit_km<=previous_km then raise exception 'Kilometre limits must increase'; end if;
   previous_km:=limit_km;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.validate_delivery_tiers() from public,anon,authenticated;
drop trigger if exists delivery_rates_validate_tiers on public.delivery_rates;
create trigger delivery_rates_validate_tiers before insert or update on public.delivery_rates for each row execute function public.validate_delivery_tiers();
create or replace function public.delivery_charge_for_distance(km numeric) returns integer
language plpgsql stable security definer set search_path='' as $$
declare bands jsonb; band jsonb;
begin
 if km is null or km<0 or km::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid distance'; end if;
 select tiers into strict bands from public.delivery_rates where id;
 for band in select value from jsonb_array_elements(bands) loop
  if band->'maxKm'='null'::jsonb or km<=(band->>'maxKm')::numeric then return (band->>'charge')::integer; end if;
 end loop;
 raise exception 'Delivery rates unavailable';
end $$;
revoke all on function public.delivery_charge_for_distance(numeric) from public;
grant execute on function public.delivery_charge_for_distance(numeric) to anon,authenticated,service_role;
commit;

```

## Rider pending-order addresses
No new policies or indexes. Replaces `rider_dashboard(integer)` with the same active-rider check and adds only address to pending results.
```sql
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

```

## Order request protection
New RLS policies: none (RLS enabled with no client policies on both private tables). New indexes: order_request_keys_pkey, order_rate_buckets_pkey (primary keys), orders_checkout_request_unique, order_requests_cleanup, order_buckets_cleanup. Functions: take_order_token(text,integer,double precision) (internal only), begin_order_request(uuid,text,text), release_order_request(uuid,uuid) (service role only). Full SQL:
```sql
begin;
create table if not exists public.order_request_keys (
 request_key uuid primary key, fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 lease_id uuid, lease_until timestamptz not null default '-infinity', created_at timestamptz not null default now()
);
create table if not exists public.order_rate_buckets (
 bucket text primary key, tokens double precision not null, updated_at timestamptz not null
);
alter table public.order_request_keys enable row level security;
alter table public.order_rate_buckets enable row level security;
revoke all on public.order_request_keys,public.order_rate_buckets from public,anon,authenticated;
alter table public.orders add column if not exists checkout_request_id uuid;
create unique index if not exists orders_checkout_request_unique on public.orders(checkout_request_id) where checkout_request_id is not null;
create index if not exists order_requests_cleanup on public.order_request_keys(created_at);
create index if not exists order_buckets_cleanup on public.order_rate_buckets(updated_at);

create or replace function public.take_order_token(p_bucket text,p_capacity int,p_refill double precision) returns boolean
language plpgsql security definer set search_path='' as $$
declare available double precision; stamp timestamptz:=clock_timestamp(); previous public.order_rate_buckets;
begin
 insert into public.order_rate_buckets values(p_bucket,p_capacity,stamp) on conflict do nothing;
 select * into previous from public.order_rate_buckets where bucket=p_bucket for update;
 stamp:=clock_timestamp();
 available:=least(p_capacity,previous.tokens+greatest(0,extract(epoch from stamp-previous.updated_at))*p_refill);
 if available<1 then return false; end if;
 update public.order_rate_buckets set tokens=available-1,updated_at=stamp where bucket=p_bucket;
 return true;
end $$;
revoke all on function public.take_order_token(text,integer,double precision) from public,anon,authenticated,service_role;

create or replace function public.begin_order_request(p_key uuid,p_fingerprint text,p_phone_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reservation public.order_request_keys; existing public.orders; lease uuid;
begin
 if p_key is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_phone_hash is null or p_phone_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request reference'; end if;
 -- Global burst of 30, replenished at 2 requests/sec. No dependence on spoofable IP headers.
 if not public.take_order_token('global',30,2) then return jsonb_build_object('status','rate_limited','retryAfter',1); end if;
 -- Bounded cleanup; completed request keys are retained while their orders exist.
 delete from public.order_rate_buckets where bucket in (select bucket from public.order_rate_buckets where updated_at<now()-interval '1 day' and bucket<>'global' limit 20);
 delete from public.order_request_keys where request_key in (select r.request_key from public.order_request_keys r where created_at<now()-interval '1 day' and lease_until<now() and not exists(select 1 from public.orders o where o.checkout_request_id=r.request_key) limit 20);
 select * into reservation from public.order_request_keys where request_key=p_key for update;
 if found then
  if reservation.fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict'); end if;
  select * into existing from public.orders where checkout_request_id=p_key;
  if found then return jsonb_build_object('status','replay','orderId',existing.id,'createdAt',existing.created_at,'subtotal',existing.subtotal); end if;
  if reservation.lease_until>clock_timestamp() then return jsonb_build_object('status','in_progress','retryAfter',3); end if;
 end if;
 -- Phone is HMAC-hashed on the server. Burst of 5, replenished at 1 attempt/minute.
 if not public.take_order_token('phone:'||p_phone_hash,5,1.0/60) then return jsonb_build_object('status','rate_limited','retryAfter',60); end if;
 insert into public.order_request_keys(request_key,fingerprint) values(p_key,p_fingerprint) on conflict do nothing;
 select * into reservation from public.order_request_keys where request_key=p_key for update;
 if reservation.fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict'); end if;
 if reservation.lease_until>clock_timestamp() then return jsonb_build_object('status','in_progress','retryAfter',3); end if;
 lease:=gen_random_uuid();
 update public.order_request_keys set lease_id=lease,lease_until=clock_timestamp()+interval '90 seconds' where request_key=p_key;
 return jsonb_build_object('status','accepted','leaseId',lease);
end $$;
revoke all on function public.begin_order_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_order_request(uuid,text,text) to service_role;

create or replace function public.release_order_request(p_key uuid,p_lease uuid) returns void
language sql security definer set search_path='' as $$
 update public.order_request_keys set lease_until='-infinity' where request_key=p_key and lease_id=p_lease
$$;
revoke all on function public.release_order_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_order_request(uuid,uuid) to service_role;
commit;

```

## Waiting-order alerts
No new RLS policies or indexes. Existing delivery_settings admin policy controls the new threshold column. New functions: rider_availability() (public aggregate only), admin_waiting_orders() and admin_cancel_waiting_order(uuid,text) (admin checked). Full definitions:
```sql
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

```

## Order cleanup
New policies: none; backup table has RLS and no client access. Index: order_cleanup_batches_pkey. Functions: prepare_order_cleanup(integer), delete_old_order_batch(uuid,text), both admin checked.
```sql
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

```
