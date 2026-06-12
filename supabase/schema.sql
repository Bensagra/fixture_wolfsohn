create table if not exists public.tournaments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "Demo can read tournament"
on public.tournaments for select
to anon
using (true);

create policy "Admins can write tournament"
on public.tournaments for all
to authenticated
using (true)
with check (true);
