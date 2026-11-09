begin;

-- Replace legacy total/status checks without changing orders or access policies.
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mstatus\M'
      and pg_get_constraintdef(oid) ~ '\mtotal\M'
  loop
    execute format('alter table public.orders drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.orders add constraint orders_tracking_total_check check (
  (status in ('pending', 'awaiting_charge', 'declined') and total is null)
  or (status in ('quoted', 'confirmed', 'preparing', 'out_for_delivery', 'delivered')
      and delivery_charge is not null and total is not null
      and total = subtotal + delivery_charge)
  or (status = 'cancelled'
      and (total is null or (delivery_charge is not null and total = subtotal + delivery_charge)))
);

commit;
