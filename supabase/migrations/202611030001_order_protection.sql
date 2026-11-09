begin;
create table if not exists public.order_request_keys (
 request_key uuid primary key, fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 lease_id uuid, lease_until timestamptz not null default '-infinity', created_at timestamptz not null default now()
);
create table if not exists public.order_rate_buckets (
 bucket text primary key, tokens double precision not null, updated_at timestamptz not null
);
alter table public.order_request_keys enable row level security;
alter table public.order_rate_buckets enable row level security;
revoke all on public.order_request_keys,public.order_rate_buckets from public,anon,authenticated;
alter table public.orders add column if not exists checkout_request_id uuid;
create unique index if not exists orders_checkout_request_unique on public.orders(checkout_request_id) where checkout_request_id is not null;
create index if not exists order_requests_cleanup on public.order_request_keys(created_at);
create index if not exists order_buckets_cleanup on public.order_rate_buckets(updated_at);

create or replace function public.take_order_token(p_bucket text,p_capacity int,p_refill double precision) returns boolean
language plpgsql security definer set search_path='' as $$
declare available double precision; stamp timestamptz:=clock_timestamp(); previous public.order_rate_buckets;
begin
 insert into public.order_rate_buckets values(p_bucket,p_capacity,stamp) on conflict do nothing;
 select * into previous from public.order_rate_buckets where bucket=p_bucket for update;
 stamp:=clock_timestamp();
 available:=least(p_capacity,previous.tokens+greatest(0,extract(epoch from stamp-previous.updated_at))*p_refill);
 if available<1 then return false; end if;
 update public.order_rate_buckets set tokens=available-1,updated_at=stamp where bucket=p_bucket;
 return true;
end $$;
revoke all on function public.take_order_token(text,integer,double precision) from public,anon,authenticated,service_role;

create or replace function public.begin_order_request(p_key uuid,p_fingerprint text,p_phone_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reservation public.order_request_keys; existing public.orders; lease uuid;
begin
 if p_key is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_phone_hash is null or p_phone_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request reference'; end if;
 -- Global burst of 30, replenished at 2 requests/sec. No dependence on spoofable IP headers.
 if not public.take_order_token('global',30,2) then return jsonb_build_object('status','rate_limited','retryAfter',1); end if;
 -- Bounded cleanup; completed request keys are retained while their orders exist.
 delete from public.order_rate_buckets where bucket in (select bucket from public.order_rate_buckets where updated_at<now()-interval '1 day' and bucket<>'global' limit 20);
 delete from public.order_request_keys where request_key in (select r.request_key from public.order_request_keys r where created_at<now()-interval '1 day' and lease_until<now() and not exists(select 1 from public.orders o where o.checkout_request_id=r.request_key) limit 20);
 select * into reservation from public.order_request_keys where request_key=p_key for update;
 if found then
  if reservation.fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict'); end if;
  select * into existing from public.orders where checkout_request_id=p_key;
  if found then return jsonb_build_object('status','replay','orderId',existing.id,'createdAt',existing.created_at,'subtotal',existing.subtotal); end if;
  if reservation.lease_until>clock_timestamp() then return jsonb_build_object('status','in_progress','retryAfter',3); end if;
 end if;
 -- Phone is HMAC-hashed on the server. Burst of 5, replenished at 1 attempt/minute.
 if not public.take_order_token('phone:'||p_phone_hash,5,1.0/60) then return jsonb_build_object('status','rate_limited','retryAfter',60); end if;
 insert into public.order_request_keys(request_key,fingerprint) values(p_key,p_fingerprint) on conflict do nothing;
 select * into reservation from public.order_request_keys where request_key=p_key for update;
 if reservation.fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict'); end if;
 if reservation.lease_until>clock_timestamp() then return jsonb_build_object('status','in_progress','retryAfter',3); end if;
 lease:=gen_random_uuid();
 update public.order_request_keys set lease_id=lease,lease_until=clock_timestamp()+interval '90 seconds' where request_key=p_key;
 return jsonb_build_object('status','accepted','leaseId',lease);
end $$;
revoke all on function public.begin_order_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_order_request(uuid,text,text) to service_role;

create or replace function public.release_order_request(p_key uuid,p_lease uuid) returns void
language sql security definer set search_path='' as $$
 update public.order_request_keys set lease_until='-infinity' where request_key=p_key and lease_id=p_lease
$$;
revoke all on function public.release_order_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_order_request(uuid,uuid) to service_role;
commit;
