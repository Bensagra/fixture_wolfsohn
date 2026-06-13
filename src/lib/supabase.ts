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
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc("join_tournament_by_code", {
    code_input: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return (data as TournamentState | null) ?? null;
}

export async function ensureAnonymousSession() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export async function setRemoteMyTeam(tournamentId: string, teamId: string | null) {
  if (!supabase) return;
  await ensureAnonymousSession();
  const { error } = await supabase
    .from("tournament_memberships")
    .update({ team_id: teamId })
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  if (teamId) {
    await supabase
      .from("push_subscriptions")
      .update({ team_id: teamId, updated_at: new Date().toISOString() })
      .eq("tournament_id", tournamentId);
  }
}

export async function savePushSubscription(
  tournamentId: string,
  teamId: string,
  subscription: PushSubscription,
) {
  if (!supabase) return;
  const session = await ensureAnonymousSession();
  if (!session) throw new Error("No se pudo iniciar la sesión anónima.");
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: session.user.id,
      tournament_id: tournamentId,
      team_id: teamId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

export async function sendMatchAlert(tournamentId: string, matchId: string, kind: "called" | "starting") {
  if (!supabase) return false;
  const { error } = await supabase.functions.invoke("send-team-notification", {
    body: { tournamentId, matchId, kind },
  });
  if (error) throw error;
  return true;
}

export function subscribeToTournamentChanges(onUpdate: (state: TournamentState) => void) {
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel("tournament-live-updates")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tournaments" },
      (payload) => {
        const row = payload.new as TournamentRow;
        if (row?.data) onUpdate(hydrateRow(row));
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
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
  return Boolean(session && !session.user.is_anonymous);
}

export async function signInAdmin(email: string, password: string) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
