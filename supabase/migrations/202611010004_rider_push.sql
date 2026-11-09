begin;
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null, p256dh text not null, auth text not null,
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), user_agent text
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon,authenticated;
grant select,delete on public.push_subscriptions to authenticated;
drop policy if exists push_own_read on public.push_subscriptions;
create policy push_own_read on public.push_subscriptions for select to authenticated using(public.is_rider() and user_id=auth.uid());
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions for delete to authenticated using(public.is_rider() and user_id=auth.uid());
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_rider(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 -- Restrict outgoing requests to browser push providers; never arbitrary URLs.
 if p_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-zA-Z0-9.-]+\.push.apple.com|web.push.apple.com|[a-zA-Z0-9.-]+\.notify.windows.com)/' or length(p_endpoint)>2048 or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{20,30}={0,2}$' then raise exception 'Unsupported push subscription'; end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) values(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_user_agent,300))
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,last_seen_at=now(),user_agent=excluded.user_agent where public.push_subscriptions.user_id=auth.uid();
 if not found then raise exception 'Subscription belongs to another account'; end if;
end $$;
revoke all on function public.save_push_subscription(text,text,text,text) from public,anon;
grant execute on function public.save_push_subscription(text,text,text,text) to authenticated;
create table if not exists public.order_push_jobs (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 kind text not null check(kind in ('new','reminder')), due_at timestamptz not null,
 claimed_at timestamptz, finished_at timestamptz, attempts int not null default 0,
 unique(order_id,kind)
);
alter table public.order_push_jobs add column if not exists telegram_sent_at timestamptz;
alter table public.order_push_jobs enable row level security;
revoke all on public.order_push_jobs from anon,authenticated;
create index if not exists order_push_jobs_due on public.order_push_jobs(due_at) where finished_at is null;
create or replace function public.enqueue_order_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' then
 insert into public.order_push_jobs(order_id,kind,due_at) values(new.id,'new',now()),(new.id,'reminder',now()+interval '2 minutes') on conflict do nothing;
 end if;
 return new;
end $$;
drop trigger if exists orders_enqueue_push on public.orders;
create trigger orders_enqueue_push after insert on public.orders for each row execute function public.enqueue_order_push();
create or replace function public.claim_push_jobs() returns setof public.order_push_jobs language sql security definer set search_path='' as $$
 update public.order_push_jobs set claimed_at=now(),attempts=attempts+1 where id in (
 select id from public.order_push_jobs where finished_at is null and due_at<=now() and attempts<3 and (claimed_at is null or claimed_at<now()-interval '5 minutes') order by due_at limit 10 for update skip locked
 ) returning *;
$$;
revoke all on function public.enqueue_order_push() from public,anon,authenticated;
revoke all on function public.claim_push_jobs() from public,anon,authenticated;
grant execute on function public.claim_push_jobs() to service_role;
grant all on public.push_subscriptions,public.order_push_jobs to service_role;
commit;
