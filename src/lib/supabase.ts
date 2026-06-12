import { createClient } from "@supabase/supabase-js";
import type { TournamentState } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);
export const supabase = supabaseEnabled ? createClient(url, anonKey) : null;

export async function loadRemoteTournament(id: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tournaments")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as TournamentState | undefined) ?? null;
}

export async function saveRemoteTournament(state: TournamentState) {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  const { error } = await supabase.from("tournaments").upsert({
    id: state.id,
    data: state,
    updated_at: new Date().toISOString(),
  });
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
