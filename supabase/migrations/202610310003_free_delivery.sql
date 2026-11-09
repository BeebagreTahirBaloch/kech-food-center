begin;
-- Replace only the charge and total consistency checks, preserving status/RLS rules.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.orders'::regclass and contype='c'
 and (pg_get_constraintdef(oid) ~ '\mdelivery_charge\M') loop
  execute format('alter table public.orders drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.orders add constraint orders_delivery_charge_check check(delivery_charge is null or delivery_charge in (0,100,150,200,300,400,500));
alter table public.orders add constraint orders_tracking_total_check check(
 (status in ('pending','awaiting_charge','declined') and total is null)
 or (status in ('quoted','confirmed','preparing','out_for_delivery','delivered') and delivery_charge is not null and total is not null and total=subtotal+delivery_charge)
 or (status='cancelled' and (total is null or (delivery_charge is not null and total=subtotal+delivery_charge)))
);
commit;
