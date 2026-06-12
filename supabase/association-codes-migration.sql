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
  where association_code = upper(regexp_replace(code_input, '[^A-Za-z0-9]', '', 'g'))
    and coalesce((data->'settings'->>'published')::boolean, false)
  limit 1;
$$;

revoke all on function public.get_tournament_by_code(text) from public;
grant execute on function public.get_tournament_by_code(text) to anon, authenticated;
