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
