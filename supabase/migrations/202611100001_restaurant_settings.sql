-- Run after the existing migrations. Reruns preserve the owner's saved values.
begin;

create table if not exists public.restaurant_settings (
  id boolean primary key default true check (id),
  minimum_order_amount integer not null default 0 check (minimum_order_amount between 0 and 2000000),
  restaurant_phone text not null default '03352053652' check (restaurant_phone ~ '^\+?[0-9]{7,15}$')
);
insert into public.restaurant_settings (id) values (true) on conflict (id) do nothing;

alter table public.restaurant_settings enable row level security;
revoke all on public.restaurant_settings from public, anon, authenticated;
grant select on public.restaurant_settings to anon, authenticated;
grant update (minimum_order_amount, restaurant_phone) on public.restaurant_settings to authenticated;
grant select on public.restaurant_settings to service_role;

-- This table contains only public restaurant information, never customer data.
drop policy if exists restaurant_settings_read on public.restaurant_settings;
create policy restaurant_settings_read on public.restaurant_settings
  for select to anon, authenticated using (true);

drop policy if exists restaurant_settings_admin_update on public.restaurant_settings;
create policy restaurant_settings_admin_update on public.restaurant_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Enforce against the server-priced food subtotal, including if the minimum
-- changes after create-order's precheck. Existing orders are never revalidated.
create or replace function public.enforce_minimum_order_amount()
returns trigger language plpgsql security definer set search_path = '' as $$
declare minimum_amount integer;
begin
  select minimum_order_amount into minimum_amount
  from public.restaurant_settings where id = true for share;
  if minimum_amount is null then
    raise exception 'Restaurant settings are unavailable. Please try again.' using errcode = 'PFC02';
  end if;
  if new.subtotal < minimum_amount then
    raise exception 'Minimum food order is Rs. % (excluding delivery). Please add more items.', minimum_amount
      using errcode = 'PFC01';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_minimum_order_amount() from public, anon, authenticated;
drop trigger if exists orders_check_minimum_amount on public.orders;
create trigger orders_check_minimum_amount before insert on public.orders
  for each row execute function public.enforce_minimum_order_amount();

-- Keep these edits in the existing owner history. This phone is the public
-- restaurant contact number, not a customer or rider's private information.
create or replace function public.audit_restaurant_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.minimum_order_amount is distinct from new.minimum_order_amount
    or old.restaurant_phone is distinct from new.restaurant_phone then
    insert into public.admin_activity (actor_id, action, entity, entity_id, before_data, after_data)
    values (auth.uid(), 'UPDATE', 'restaurant_settings', 'true',
      jsonb_build_object('minimum_order_amount', old.minimum_order_amount, 'restaurant_phone', old.restaurant_phone),
      jsonb_build_object('minimum_order_amount', new.minimum_order_amount, 'restaurant_phone', new.restaurant_phone));
  end if;
  return new;
end;
$$;
revoke all on function public.audit_restaurant_settings() from public, anon, authenticated;
drop trigger if exists restaurant_settings_audit on public.restaurant_settings;
create trigger restaurant_settings_audit after update on public.restaurant_settings
  for each row execute function public.audit_restaurant_settings();

commit;
