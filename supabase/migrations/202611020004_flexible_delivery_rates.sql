begin;
alter table public.delivery_rates add column if not exists tiers jsonb;
update public.delivery_rates set tiers=jsonb_build_array(
 jsonb_build_object('maxKm',first_km,'charge',first_charge),
 jsonb_build_object('maxKm',second_km,'charge',second_charge),
 jsonb_build_object('maxKm',null,'charge',final_charge)) where tiers is null;
alter table public.delivery_rates alter column tiers set not null;
create or replace function public.validate_delivery_tiers() returns trigger
language plpgsql set search_path='' as $$
declare band jsonb; previous_km numeric:=0; limit_km numeric; fee numeric; position int:=0; count_bands int;
begin
 if jsonb_typeof(new.tiers)<>'array' then raise exception 'Delivery rates must be a list'; end if;
 count_bands:=jsonb_array_length(new.tiers);
 if count_bands<1 then raise exception 'Add at least one delivery rate'; end if;
 for band in select value from jsonb_array_elements(new.tiers) loop
  position:=position+1;
  if jsonb_typeof(band)<>'object' or not (band ? 'maxKm') or jsonb_typeof(band->'charge') is distinct from 'number' then raise exception 'Invalid delivery rate'; end if;
  fee:=(band->>'charge')::numeric;
  if fee<0 or fee>10000 or fee<>trunc(fee) then raise exception 'Charges must be whole rupees from 0 to 10000'; end if;
  if position=count_bands then
   if band->'maxKm'<>'null'::jsonb then raise exception 'The final range must cover all remaining distances'; end if;
  else
   if jsonb_typeof(band->'maxKm') is distinct from 'number' then raise exception 'Enter a kilometre limit'; end if;
   limit_km:=(band->>'maxKm')::numeric;
   if limit_km<=previous_km then raise exception 'Kilometre limits must increase'; end if;
   previous_km:=limit_km;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.validate_delivery_tiers() from public,anon,authenticated;
drop trigger if exists delivery_rates_validate_tiers on public.delivery_rates;
create trigger delivery_rates_validate_tiers before insert or update on public.delivery_rates for each row execute function public.validate_delivery_tiers();
create or replace function public.delivery_charge_for_distance(km numeric) returns integer
language plpgsql stable security definer set search_path='' as $$
declare bands jsonb; band jsonb;
begin
 if km is null or km<0 or km::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid distance'; end if;
 select tiers into strict bands from public.delivery_rates where id;
 for band in select value from jsonb_array_elements(bands) loop
  if band->'maxKm'='null'::jsonb or km<=(band->>'maxKm')::numeric then return (band->>'charge')::integer; end if;
 end loop;
 raise exception 'Delivery rates unavailable';
end $$;
revoke all on function public.delivery_charge_for_distance(numeric) from public;
grant execute on function public.delivery_charge_for_distance(numeric) to anon,authenticated,service_role;
commit;
