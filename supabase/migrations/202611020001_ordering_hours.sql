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
