alter table public.tournaments
add column if not exists association_code text;

update public.tournaments
set association_code = (1000 + floor(random() * 9000)::integer)::text
where association_code is null;

alter table public.tournaments
alter column association_code set default (1000 + floor(random() * 9000)::integer)::text,
alter column association_code set not null;

create unique index if not exists tournaments_association_code_key
on public.tournaments (association_code);

drop policy if exists "Demo can read tournament" on public.tournaments;
drop policy if exists "Admins can read tournaments" on public.tournaments;

create policy "Admins can read tournaments"
on public.tournaments for select
to authenticated
using (true);

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
