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
