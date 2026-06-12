import { createClient } from "@supabase/supabase-js";
import type { TournamentState } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);
export const supabase = supabaseEnabled ? createClient(url, anonKey) : null;

type TournamentRow = {
  data: TournamentState;
  association_code: string;
};

const hydrateRow = (row: TournamentRow): TournamentState => ({
  ...row.data,
  associationCode: row.association_code,
});

export async function loadRemoteTournaments() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tournaments")
    .select("data, association_code")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TournamentRow[]).map(hydrateRow);
}

export async function loadRemoteTournamentByCode(code: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_tournament_by_code", {
    code_input: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return (data as TournamentState | null) ?? null;
}

export async function saveRemoteTournament(state: TournamentState) {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  const { error } = await supabase.from("tournaments").upsert({
    id: state.id,
    association_code: state.associationCode,
    data: state,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return true;
}

export async function deleteRemoteTournament(id: string) {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function hasAdminSession() {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return Boolean(session);
}

export async function signInAdmin(email: string, password: string) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
