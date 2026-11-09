begin;
create or replace function public.rider_cancel_order(order_id uuid,reason text,note text default '') returns text
language plpgsql security definer set search_path='' as $$
declare o public.orders; wait_for int; remaining int;
begin
 if not coalesce(public.is_rider(),false) then return 'not_authorized'; end if;
 select * into o from public.orders where id=order_id and rider_id=auth.uid() for update;
 if not found or o.status not in ('awaiting_charge','quoted','confirmed','preparing','out_for_delivery') then return 'Order already changed'; end if;
 if reason is null or reason not in ('no_answer','wrong_address','customer_refused','other') or length(coalesce(note,''))>500 or (reason='other' and length(trim(coalesce(note,'')))=0) then return 'Choose a reason and add a note for other'; end if;
 if reason='no_answer' then
  if not exists(select 1 from public.call_attempts c where c.order_id=o.id and c.rider_id=auth.uid() and c.created_at>=o.accepted_at) then return 'Call the customer first'; end if;
  if o.arrived_at is not null then
   select wait_minutes into wait_for from public.delivery_settings where id;
   remaining:=ceil(extract(epoch from (greatest(o.arrived_at,o.customer_here_at)+make_interval(mins=>wait_for)-now()))/60);
   if remaining>0 then return 'Wait '||remaining||' more minutes'; end if;
  end if;
 end if;
 update public.orders set status='cancelled',cancelled_at=now(),cancelled_by='rider',cancel_reason=reason,cancel_note=trim(coalesce(note,'')) where id=o.id;
 return 'cancelled';
end $$;
revoke all on function public.rider_cancel_order(uuid,text,text) from public,anon;
grant execute on function public.rider_cancel_order(uuid,text,text) to authenticated;
commit;
