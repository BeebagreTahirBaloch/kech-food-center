# Readable owner activity

The History and backups page now identifies each editor by their Supabase login email (including Gmail addresses). It resolves existing events too. Open an entry to see only the fields that changed, in readable Before and After columns. Prices use Rs.; ordering times use AM/PM; activity timestamps use Asia/Karachi.

## Apply this update

1. Open `supabase/migrations/202611080002_readable_owner_activity.sql`.
2. Paste the **entire file** into a **new** Supabase SQL Editor query and run it. It is safe to run more than once. The existing owner-history migration, `202611070001_customer_history.sql`, must already be installed.
3. Refresh the local site. If hosted, build and publish the updated frontend with `npm run build`.
4. Open `/admin/history` while signed in as an admin.

Do not rerun `supabase/schema.sql`. No Edge Functions need deployment and no new secrets are required.

## What to check

- Open an older activity entry: it should show the actor's email rather than a UUID.
- Update an ordering-hours setting, save, then refresh history. A schedule toggle displays Off / On. Unchanged fields are omitted. When opening/closing times change, values display like 4:00 PM and 11:59 PM.
- A price change shows the old and new rupee amounts. Availability shows Available / Sold out. Delivery tiers and rider limits have readable units.
- Check the Before and After columns on a phone.
- Logged-out visitors see the admin login; customers and riders are refused. Direct calls to the new SQL function also require admin membership.

Emails and category names are resolved from the current account/category records; they are not historical snapshots. Deleted accounts display **Deleted account**; changes without a signed-in actor display **Server / SQL Editor**. Existing audit records remain unchanged. No direct access to `auth.users` is granted.

Local checks: `node scripts/test-customer-operations.mjs` tests repeatable SQL, permission checks, legacy email resolution and pagination against an isolated database. `node scripts/test-customer-updates-browser.mjs` checks the phone/desktop display, route guard and error recovery against mocked data at localhost:5182. Neither test uses live orders.

## New SQL for review

New RLS policies: **none**. The existing `admin_activity_read` policy stays in place.

New indexes: **none**. Pagination uses the existing `admin_activity_created` index.

New database function: **admin_activity_feed(integer, integer)**, defined below in full. It checks `is_admin()`, has a fixed empty search path, returns a bounded page, and has no anonymous EXECUTE grant. Only the account email is read from Auth.

```sql
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
```
