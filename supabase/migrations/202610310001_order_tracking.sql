begin;
alter table public.orders add column if not exists confirmed_at timestamptz;
alter table public.orders add column if not exists eta_minutes integer;
alter table public.orders add column if not exists out_for_delivery_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
-- Replace both legacy status checks, including the total/status consistency check.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.orders'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '\mstatus\M' loop
  execute format('alter table public.orders drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.orders add constraint orders_tracking_status_check check(status in ('pending','awaiting_charge','quoted','confirmed','preparing','out_for_delivery','delivered','declined','cancelled'));
alter table public.orders add constraint orders_tracking_total_check check(
 (status in ('pending','awaiting_charge','declined') and total is null) or
 (status in ('quoted','confirmed','preparing','out_for_delivery','delivered','cancelled') and delivery_charge is not null and total = subtotal + delivery_charge)
);
create or replace function public.stamp_order_progress() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status='confirmed' then new.confirmed_at:=coalesce(old.confirmed_at,now()); end if;
  if new.status='out_for_delivery' then new.out_for_delivery_at:=coalesce(old.out_for_delivery_at,now()); end if;
  if new.status='delivered' then new.delivered_at:=coalesce(old.delivered_at,now()); end if;
 end if;
 return new;
end; $$;
drop trigger if exists orders_progress_timestamps on public.orders;
create trigger orders_progress_timestamps before update on public.orders for each row execute function public.stamp_order_progress();
alter table public.orders enable row level security;
revoke all on public.orders from anon,authenticated;
revoke select(customer_name,phone,address,telegram_error,telegram_message_id,telegram_chat_id) on public.orders from anon,authenticated;
grant select(id,items,lat,lng,subtotal,distance_km,delivery_charge,total,status,eta_minutes,created_at,confirmed_at,out_for_delivery_at,delivered_at) on public.orders to anon,authenticated;
drop policy if exists "Track only the order identified by UUID" on public.orders;
create policy "Track only the order identified by UUID" on public.orders for select to anon,authenticated
 using(id::text=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-order-id',''));
create or replace function public.broadcast_order_tracking_update() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send(jsonb_build_object('id',new.id,'items',new.items,'lat',new.lat,'lng',new.lng,'subtotal',new.subtotal,'distanceKm',new.distance_km,'deliveryCharge',new.delivery_charge,'total',new.total,'status',new.status,'etaMinutes',new.eta_minutes,'createdAt',new.created_at,'confirmedAt',new.confirmed_at,'outForDeliveryAt',new.out_for_delivery_at,'deliveredAt',new.delivered_at),'order_update','order:'||new.id::text,false);
 return new;
end; $$;
commit;
