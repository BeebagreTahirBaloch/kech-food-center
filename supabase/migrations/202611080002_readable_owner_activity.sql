-- Resolve account emails only for an authenticated admin, including older events.
-- Audit records and existing table policies are unchanged. Safe to run again.
begin;

create or replace function public.admin_activity_feed(
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id uuid,
  action text,
  entity text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz,
  actor_email text,
  actor_type text,
  before_category_name text,
  after_category_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select e.id, e.action, e.entity, e.before_data, e.after_data, e.created_at,
    u.email::text,
    case when e.actor_id is null then 'system'
         when u.id is null then 'account_removed'
         else 'account' end,
    previous_category.name::text, current_category.name::text
  from (
    select a.* from public.admin_activity a
    order by a.created_at desc, a.id
    limit least(100, greatest(1, coalesce(p_limit, 25)))
    offset greatest(0, coalesce(p_offset, 0))
  ) e
  left join auth.users u on u.id = e.actor_id
  left join public.categories previous_category
    on previous_category.id::text = e.before_data ->> 'category_id'
  left join public.categories current_category
    on current_category.id::text = e.after_data ->> 'category_id'
  order by e.created_at desc, e.id;
end;
$$;

revoke all on function public.admin_activity_feed(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_activity_feed(integer, integer) to authenticated;

commit;
