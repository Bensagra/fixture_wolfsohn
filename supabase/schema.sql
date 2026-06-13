create table if not exists public.tournaments (
  id text primary key,
  association_code text not null unique default (1000 + floor(random() * 9000)::integer)::text
    check (association_code ~ '^[0-9]{4}$'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "Admins can read tournaments"
on public.tournaments for select
to authenticated
using (true);

create policy "Admins can write tournaments"
on public.tournaments for all
to authenticated
using (true)
with check (true);

create or replace function public.get_tournament_by_code(code_input text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data || jsonb_build_object('associationCode', association_code)
  from public.tournaments
  where association_code = left(regexp_replace(code_input, '[^0-9]', '', 'g'), 4)
    and coalesce((data->'settings'->>'published')::boolean, false)
  limit 1;
$$;

revoke all on function public.get_tournament_by_code(text) from public;
grant execute on function public.get_tournament_by_code(text) to anon, authenticated;
