begin;
alter table public.orders add column if not exists estimated_delivery_charge integer check (estimated_delivery_charge >= 0);
-- Old orders intentionally keep NULL: do not invent a historical estimate.
-- Existing single-order RLS still applies to this safe column.
grant select(estimated_delivery_charge) on public.orders to anon, authenticated;
commit;
