-- Convierte todos los códigos existentes a PINs numéricos únicos de 4 cifras.
-- Ejecutar una vez desde Supabase SQL Editor.

begin;

do $$
begin
  if (select count(*) from public.tournaments) > 9000 then
    raise exception 'No se pueden asignar códigos de 4 cifras a más de 9000 torneos.';
  end if;
end $$;

alter table public.tournaments
drop constraint if exists tournaments_association_code_key;

drop index if exists public.tournaments_association_code_key;

with numbered as (
  select id, row_number() over (order by id) as position
  from public.tournaments
)
update public.tournaments tournament
set association_code = (999 + numbered.position)::text
from numbered
where tournament.id = numbered.id;

alter table public.tournaments
alter column association_code set default (1000 + floor(random() * 9000)::integer)::text,
alter column association_code set not null;

alter table public.tournaments
drop constraint if exists tournaments_association_code_four_digits;

alter table public.tournaments
add constraint tournaments_association_code_four_digits
check (association_code ~ '^[0-9]{4}$');

create unique index tournaments_association_code_key
on public.tournaments (association_code);

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
  where association_code = left(regexp_replace(code_input, '[^0-9]', '', 'g'), 4)
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

revoke all on function public.get_tournament_by_code(text) from public;
grant execute on function public.get_tournament_by_code(text) to anon, authenticated;
revoke all on function public.join_tournament_by_code(text) from public;
grant execute on function public.join_tournament_by_code(text) to authenticated;

commit;
