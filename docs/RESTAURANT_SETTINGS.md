# Minimum order and restaurant phone

The owner can edit both fields at **/admin/settings → Minimum order & restaurant contact**.

- The minimum is in whole PKR and applies to the **food subtotal before delivery**.
- **0 disables the minimum**. This is the initial value, so applying the migration does not reject previously valid new orders.
- A cart exactly equal to the minimum is allowed. Existing orders retain their totals and continue through acceptance, cancellation and delivery.
- The restaurant phone initially remains **03352053652**. Spaces, parentheses and hyphens are removed on save. Local numbers and international numbers with a leading `+` are supported (7–15 digits).
- Restaurant call links in the desktop/mobile navigation, footer, tracking help and delayed-order cards all use the saved number. Rider/customer call links keep their own numbers.
- Public settings refresh every 30 seconds while the page is visible and when it regains focus or connectivity. Saving from the admin page updates that browser immediately.
- Settings edits appear in **History and backups → Owner activity**, with the admin's email and readable before/after values.

## Deploy in this order

1. Open Supabase **SQL Editor → New query**. Paste the complete contents of [202611100001_restaurant_settings.sql](../supabase/migrations/202611100001_restaurant_settings.sql) and run it. It is safe to run again and preserves saved values. Do not run `supabase/schema.sql`.
2. From the project folder in the terminal, deploy the changed function:

   ```powershell
   npx supabase functions deploy create-order --project-ref zsangbpeyefwovceierd
   ```

   If the CLI asks whether to deploy, select **Yes**. No other functions need redeployment. No new secrets or Vercel environment variables are required.
3. Commit and push the frontend changes to the GitHub branch connected to Vercel. Wait for the deployment to finish.
4. Sign in to **/admin/settings**, choose the minimum and restaurant number, and click **Save restaurant settings**.

## Checks to make

Use test orders for checkout checks.

1. Set the minimum to Rs. 1,000. A food subtotal of Rs. 900 must show **Add Rs. 100 more**, even if food plus delivery exceeds Rs. 1,000. Sending is disabled.
2. Increase the food subtotal to exactly Rs. 1,000. Checkout is available once the other delivery requirements are met.
3. Open checkout in one tab, then raise the minimum in admin in another tab. Even before the customer page refreshes, the server must reject an order below the new minimum and keep the cart.
4. Set the minimum to 0. Small orders are allowed again.
5. Change the restaurant number. Refresh the home, cart, orders and tracking pages and check their restaurant call links. **Call rider** must still use the rider's number.
6. Check the fields on a phone and confirm the changes appear in Owner activity.
7. Signed-out visitors and ordinary customers can read these two public settings but cannot change them. They cannot insert/delete the settings row or gain access to order/customer data.

## Implementation and security

- `create-order` calculates menu prices on the server and checks the saved minimum. Browser-supplied prices or minimum values do not override it.
- A **BEFORE INSERT** trigger checks the latest minimum again and takes a shared row lock for the insertion. A change between the initial check and insert is handled as a minimum-order error.
- Existing rows are not revalidated on updates. Idempotent retries for an already-created order still return that order even if the minimum has since increased.
- If settings cannot be fetched, new checkout waits for a successful retry instead of assuming no minimum.
- The new table contains only the singleton ID, minimum amount and public restaurant phone. Public users may select these fields. Only logged-in admins may update the two settings; clients cannot insert or delete the row.
- The activity trigger stores only these two public setting values. No customer contact details, credentials or tokens are added to the audit log.
- Trigger functions have an empty `search_path` and no public/client execute grant. Orders RLS and public single-order tracking remain unchanged.
- New policies: `restaurant_settings_read`, `restaurant_settings_admin_update`.
- New functions: `enforce_minimum_order_amount()`, `audit_restaurant_settings()`.
- New index: only the automatic primary-key index `restaurant_settings_pkey`. No additional indexes or Realtime publication changes.

## SQL review: all new policies, functions and triggers

The complete new migration is reproduced below for review.

```sql
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
```
