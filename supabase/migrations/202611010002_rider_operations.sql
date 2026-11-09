begin;
create table if not exists public.riders (
 user_id uuid primary key references auth.users(id), name text not null check(length(name) between 2 and 80),
 phone text not null check(length(phone) between 7 and 20), active boolean not null default true,
 online boolean not null default false, created_at timestamptz not null default now()
);
alter table public.riders enable row level security;
create or replace function public.is_rider() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.riders where user_id=auth.uid() and active) and not coalesce(public.is_admin(),false)
$$;
revoke all on public.riders from anon,authenticated;
grant select on public.riders to authenticated;
drop policy if exists riders_self_or_admin on public.riders;
create policy riders_self_or_admin on public.riders for select to authenticated using(user_id=auth.uid() or public.is_admin());
alter table public.orders add column if not exists rider_id uuid references public.riders(user_id);
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders add column if not exists released_at timestamptz;
alter table public.orders add column if not exists arrived_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by text check(cancelled_by in ('rider','customer','admin'));
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists cancel_note text;
alter table public.orders add column if not exists customer_here_at timestamptz;
alter table public.orders add column if not exists customer_here_used boolean not null default false;
create unique index if not exists orders_one_active_rider on public.orders(rider_id)
 where rider_id is not null and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery');
create index if not exists orders_rider_history on public.orders(rider_id,created_at desc);
create index if not exists orders_pending_created on public.orders(created_at desc) where status='pending';
-- Do not grant private columns to authenticated: PostgreSQL column grants cannot
-- vary by row. Checked RPCs return full rows ONLY to their assigned rider/admin.
drop policy if exists orders_rider_safe_read on public.orders;
create policy orders_rider_safe_read on public.orders for select to authenticated using(public.is_rider() and (status='pending' or rider_id=auth.uid()));
create table if not exists public.delivery_settings (
 id boolean primary key default true check(id), wait_minutes int not null default 10 check(wait_minutes between 1 and 120),
 cancel_rate_threshold numeric not null default 20 check(cancel_rate_threshold between 0 and 100)
);
insert into public.delivery_settings(id) values(true) on conflict do nothing;
alter table public.delivery_settings enable row level security;
revoke all on public.delivery_settings from anon,authenticated;
grant select,update on public.delivery_settings to authenticated;
drop policy if exists settings_admin on public.delivery_settings;
create policy settings_admin on public.delivery_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
create table if not exists public.order_events (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 actor_id uuid, event text not null, reason text, created_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
revoke all on public.order_events from anon,authenticated;
grant select on public.order_events to authenticated;
drop policy if exists events_admin_read on public.order_events;
create policy events_admin_read on public.order_events for select to authenticated using(public.is_admin());
create index if not exists order_events_order_time on public.order_events(order_id,created_at);
create table if not exists public.call_attempts (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 rider_id uuid not null references public.riders(user_id),created_at timestamptz not null default now()
);
alter table public.call_attempts enable row level security;
revoke all on public.call_attempts from anon,authenticated;
grant select on public.call_attempts to authenticated;
-- Inserts go through log_call_attempt, which supplies server time and caller ID.
drop policy if exists calls_owner_admin_read on public.call_attempts;
create policy calls_owner_admin_read on public.call_attempts for select to authenticated using(public.is_admin() or (public.is_rider() and rider_id=auth.uid() and exists(select 1 from public.orders o where o.id=order_id and o.rider_id=auth.uid() and o.status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery'))));
create index if not exists call_attempts_order_time on public.call_attempts(order_id,created_at);

create or replace function public.set_rider_online(p_online boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.riders set online=p_online where user_id=auth.uid();
end $$;
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
create or replace function public.set_quote(order_id uuid,charge int,minutes int) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 if charge not in (0,100,150,200,300,400,500) or minutes not in (30,60,120) or charge is null or minutes is null then raise exception 'Invalid charge or time'; end if;
 update public.orders set delivery_charge=charge,total=subtotal+charge,eta_minutes=minutes,confirmed_at=now(),status='confirmed' where id=order_id and rider_id=auth.uid() and status='awaiting_charge';
 return case when found then 'updated' else 'Order already changed' end;
end $$;
create or replace function public.mark_out_for_delivery(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 update public.orders set status='out_for_delivery',out_for_delivery_at=now() where id=order_id and rider_id=auth.uid() and status in ('confirmed','preparing');
 return case when found then 'updated' else 'Order already changed' end;
end $$;
create or replace function public.mark_delivered(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 update public.orders set status='delivered',delivered_at=now() where id=order_id and rider_id=auth.uid() and status='out_for_delivery';
 return case when found then 'updated' else 'Order already changed' end;
end $$;
create or replace function public.mark_arrived(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 update public.orders set arrived_at=coalesce(arrived_at,now()) where id=order_id and rider_id=auth.uid() and status='out_for_delivery';
 return case when found then 'updated' else 'Order already changed' end;
end $$;
create or replace function public.log_call_attempt(order_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 perform 1 from public.orders where id=order_id and rider_id=auth.uid() and status in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') for update;
 if not found then return 'Order already changed'; end if;
 insert into public.call_attempts(order_id,rider_id) values(order_id,auth.uid());
 return 'updated';
end $$;
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
-- Service-only endpoint forwards a single validated tracking UUID, never a list.
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
create or replace function public.broadcast_rider_orders() returns trigger language plpgsql security definer set search_path='' as $$
begin perform realtime.send('{}'::jsonb,'changed','rider-orders',true); return new; end $$;
drop trigger if exists orders_rider_broadcast on public.orders;
create trigger orders_rider_broadcast after insert or update on public.orders for each row execute function public.broadcast_rider_orders();
drop policy if exists rider_orders_broadcast_read on realtime.messages;
create policy rider_orders_broadcast_read on realtime.messages for select to authenticated using(realtime.topic()='rider-orders' and public.is_rider());
-- Only a safe change signal is public. All details are fetched by single UUID.
create or replace function public.broadcast_order_tracking_update() returns trigger language plpgsql security definer set search_path='' as $$
begin perform realtime.send(jsonb_build_object('id',new.id),'order_update','order:'||new.id::text,false); return new; end $$;
do $$ declare f text; begin
 foreach f in array array['is_rider()','set_rider_online(boolean)','accept_order(uuid)','set_quote(uuid,integer,integer)','mark_out_for_delivery(uuid)','mark_delivered(uuid)','mark_arrived(uuid)','log_call_attempt(uuid)','rider_cancel_order(uuid,text,text)','release_order(uuid,text)','reassign_order(uuid,uuid,text)','rider_dashboard(integer)'] loop
 execute 'revoke all on function public.'||f||' from public,anon';
 execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end $$;
revoke all on function public.customer_here(uuid) from public,anon,authenticated;
grant execute on function public.customer_here(uuid) to service_role;
revoke all on function public.broadcast_rider_orders() from public,anon,authenticated;
grant all on public.riders,public.delivery_settings,public.order_events,public.call_attempts to service_role;
commit;
