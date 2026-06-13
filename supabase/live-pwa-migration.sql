-- Ejecutar una sola vez. También habilitar "Allow anonymous sign-ins"
-- en Authentication > Providers > Anonymous.

alter table public.tournaments
add column if not exists association_code text;

update public.tournaments
set association_code = upper(substr(md5(random()::text || clock_timestamp()::text || id), 1, 8))
where association_code is null;

alter table public.tournaments
alter column association_code set default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
alter column association_code set not null;

create unique index if not exists tournaments_association_code_key
on public.tournaments (association_code);

create table if not exists public.tournament_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id text not null references public.tournaments(id) on delete cascade,
  team_id text,
  joined_at timestamptz not null default now(),
  primary key (user_id, tournament_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id text not null references public.tournaments(id) on delete cascade,
  team_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

alter table public.tournament_memberships enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Demo can read tournament" on public.tournaments;
drop policy if exists "Admins can read tournaments" on public.tournaments;
drop policy if exists "Members can read joined tournaments" on public.tournaments;
drop policy if exists "Users can read own memberships" on public.tournament_memberships;
drop policy if exists "Users can update own memberships" on public.tournament_memberships;
drop policy if exists "Users can delete own memberships" on public.tournament_memberships;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;

create policy "Members can read joined tournaments"
on public.tournaments for select
to authenticated
using (
  coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  or exists (
    select 1 from public.tournament_memberships membership
    where membership.user_id = auth.uid()
      and membership.tournament_id = tournaments.id
  )
);

create policy "Users can read own memberships"
on public.tournament_memberships for select
to authenticated
using (user_id = auth.uid());

create policy "Users can update own memberships"
on public.tournament_memberships for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own memberships"
on public.tournament_memberships for delete
to authenticated
using (user_id = auth.uid());

create policy "Users manage own push subscriptions"
on public.push_subscriptions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.join_tournament_by_code(code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into tournament_row
  from public.tournaments
  where association_code = upper(regexp_replace(code_input, '[^A-Za-z0-9]', '', 'g'))
    and coalesce((data->'settings'->>'published')::boolean, false)
  limit 1;

  if tournament_row.id is null then
    return null;
  end if;

  insert into public.tournament_memberships (user_id, tournament_id)
  values (auth.uid(), tournament_row.id)
  on conflict (user_id, tournament_id) do nothing;

  return tournament_row.data || jsonb_build_object('associationCode', tournament_row.association_code);
end;
$$;

revoke all on function public.join_tournament_by_code(text) from public;
grant execute on function public.join_tournament_by_code(text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournaments'
  ) then
    alter publication supabase_realtime add table public.tournaments;
  end if;
end $$;
