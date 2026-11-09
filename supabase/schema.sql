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

-- Backend menu migration 202610300001

begin;
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name))>0), sort_order int not null default 0);
create table public.menu_items (
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories(id) on delete restrict,
 name text not null check(length(trim(name))>0), description text not null default '', image_url text not null default '',
 base_price int check(base_price>0), is_available boolean not null default true, is_deleted boolean not null default false,
 sort_order int not null default 0, updated_at timestamptz not null default now(), unique(category_id,name)
);
create table public.item_sizes (id uuid primary key default gen_random_uuid(), item_id uuid not null references public.menu_items(id) on delete cascade, label text not null check(length(trim(label))>0), price int not null check(price>0), sort_order int not null default 0, unique(item_id,label));
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.admins where user_id=auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
create policy admin_self_read on public.admins for select to authenticated using(user_id=auth.uid());
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.item_sizes enable row level security;
grant select on public.categories,public.menu_items,public.item_sizes to anon,authenticated;
grant insert,update,delete on public.categories,public.menu_items,public.item_sizes to authenticated;
grant all on public.categories,public.menu_items,public.item_sizes,public.admins to service_role;
create policy categories_read on public.categories for select to anon,authenticated using(true);
create policy items_read on public.menu_items for select to anon,authenticated using(not is_deleted or public.is_admin());
create policy sizes_read on public.item_sizes for select to anon,authenticated using(true);
create policy categories_admin on public.categories for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy items_admin on public.menu_items for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy sizes_admin on public.item_sizes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create function public.menu_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create trigger menu_item_timestamp before update on public.menu_items for each row execute function public.menu_updated_at();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('menu-images','menu-images',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;
create policy menu_images_read on storage.objects for select to anon,authenticated using(bucket_id='menu-images');
create policy menu_images_insert on storage.objects for insert to authenticated with check(bucket_id='menu-images' and public.is_admin());
create policy menu_images_update on storage.objects for update to authenticated using(bucket_id='menu-images' and public.is_admin()) with check(bucket_id='menu-images' and public.is_admin());
create policy menu_images_delete on storage.objects for delete to authenticated using(bucket_id='menu-images' and public.is_admin());

-- Atomic item/size save. Preserve size UUIDs so existing carts remain valid.
create function public.save_menu_item(p_item jsonb,p_sizes jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; s jsonb; v_size uuid;
begin
 if not public.is_admin() then raise exception 'Not authorized'; end if;
 if p_sizes is null or jsonb_typeof(p_sizes)<>'array' then raise exception 'Sizes must be an array'; end if;
 if jsonb_array_length(p_sizes)=0 and (p_item->>'base_price')::int is null then raise exception 'Enter a price or at least one size'; end if;
 v_id:=coalesce(nullif(p_item->>'id','')::uuid,gen_random_uuid());
 insert into public.menu_items(id,category_id,name,description,image_url,base_price,is_available,sort_order)
 values(v_id,(p_item->>'category_id')::uuid,trim(p_item->>'name'),coalesce(p_item->>'description',''),coalesce(p_item->>'image_url',''),case when jsonb_array_length(p_sizes)>0 then null else (p_item->>'base_price')::int end,coalesce((p_item->>'is_available')::boolean,true),coalesce((p_item->>'sort_order')::int,0))
 on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,image_url=excluded.image_url,base_price=excluded.base_price,is_available=excluded.is_available,sort_order=excluded.sort_order;
 delete from public.item_sizes where item_id=v_id and id not in(select (x->>'id')::uuid from jsonb_array_elements(p_sizes) x where nullif(x->>'id','') is not null);
 for s in select value from jsonb_array_elements(p_sizes) loop
  v_size:=coalesce(nullif(s->>'id','')::uuid,gen_random_uuid());
  if exists(select 1 from public.item_sizes where id=v_size and item_id<>v_id) then raise exception 'Invalid size'; end if;
  insert into public.item_sizes(id,item_id,label,price,sort_order) values(v_size,v_id,trim(s->>'label'),(s->>'price')::int,(s->>'sort_order')::int)
  on conflict(id) do update set label=excluded.label,price=excluded.price,sort_order=excluded.sort_order;
 end loop;
 return v_id;
end; $$;
revoke all on function public.save_menu_item(jsonb,jsonb) from public;
grant execute on function public.save_menu_item(jsonb,jsonb) to authenticated;

-- Called only by create-order with the service role; returns immutable order lines.
create function public.price_menu_cart(p_lines jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare line jsonb; product public.menu_items; size_row public.item_sizes; q int; price int; result jsonb:='[]'; sid uuid;
begin
 if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Cart must be an array'; end if;
 if jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'Add between 1 and 50 items'; end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  if (line->>'quantity') !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
  q:=(line->>'quantity')::int;
  if q is null or q not between 1 and 99 then raise exception 'Quantity must be between 1 and 99'; end if;
  select * into product from public.menu_items where id=(line->>'itemId')::uuid and not is_deleted and is_available;
  if not found then raise exception 'An item is unavailable. Refresh your cart.'; end if;
  sid:=(line->>'sizeId')::uuid;
  size_row:=null;
  if product.base_price is null then
   select * into size_row from public.item_sizes where id=sid and item_id=product.id;
   if not found then raise exception 'Choose an available size for %',product.name; end if;
   price:=size_row.price;
  else
   if sid is not null then raise exception 'This item does not have sizes'; end if;
   price:=product.base_price;
  end if;
  result:=result || jsonb_build_array(jsonb_build_object('productId',product.id,'itemId',product.id,'sizeId',sid,'name',product.name,'image',product.image_url,'optionLabel',coalesce(size_row.label,''),'unitPrice',price,'quantity',q,'lineTotal',price*q));
 end loop;
 return result;
end; $$;
revoke all on function public.price_menu_cart(jsonb) from public,anon,authenticated;
grant execute on function public.price_menu_cart(jsonb) to service_role;
commit;

