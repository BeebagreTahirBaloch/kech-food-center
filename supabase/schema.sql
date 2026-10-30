create extension if not exists pgcrypto with schema extensions;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  phone text not null check (char_length(phone) between 7 and 20),
  address text not null check (char_length(address) between 5 and 250),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  subtotal integer not null check (subtotal > 0),
  distance_km numeric(8, 1) not null check (distance_km >= 0),
  delivery_charge integer check (delivery_charge is null or delivery_charge in (100, 150, 200, 300, 400, 500)),
  total integer,
  status text not null default 'pending' check (status in ('pending', 'awaiting_charge', 'quoted', 'confirmed', 'out_for_delivery', 'delivered', 'declined', 'cancelled')),
  eta_minutes integer check (eta_minutes is null or eta_minutes in (30, 60, 120)),
  telegram_error text,
  telegram_message_id bigint,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  check (
    (status in ('pending', 'awaiting_charge', 'declined') and total is null)
    or
    (status in ('quoted', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled')
      and delivery_charge is not null
      and total = subtotal + delivery_charge)
  )
);

alter table public.orders enable row level security;
revoke all on table public.orders from anon, authenticated;
grant select (id, lat, lng, items, subtotal, distance_km, delivery_charge, total, status, eta_minutes, created_at)
  on table public.orders to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.orders from anon, authenticated;

drop policy if exists "Track only the order identified by UUID" on public.orders;
create policy "Track only the order identified by UUID"
  on public.orders
  for select
  to anon, authenticated
  using (
    id::text = coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-order-id', ''),
      ''
    )
  );

create or replace function public.broadcast_order_tracking_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'items', new.items,
      'lat', new.lat,
      'lng', new.lng,
      'subtotal', new.subtotal,
      'distanceKm', new.distance_km,
      'deliveryCharge', new.delivery_charge,
      'total', new.total,
      'status', new.status,
      'etaMinutes', new.eta_minutes,
      'createdAt', new.created_at
    ),
    'order_update',
    'order:' || new.id::text,
    false
  );
  return new;
end;
$$;

drop trigger if exists orders_tracking_broadcast on public.orders;
create trigger orders_tracking_broadcast
  after insert or update on public.orders
  for each row execute function public.broadcast_order_tracking_update();
