import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Missing authorization");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user || user.is_anonymous) throw new Error("Admin access required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { tournamentId, matchId, kind } = await request.json();
    const { data: row, error } = await admin
      .from("tournaments")
      .select("data")
      .eq("id", tournamentId)
      .single();
    if (error) throw error;

    const tournament = row.data;
    const match = tournament.matches.find((item: { id: string }) => item.id === matchId);
    if (!match) throw new Error("Match not found");
    const teamIds = [match.homeTeamId, match.awayTeamId].filter(Boolean);
    const teams = tournament.teams.filter((team: { id: string }) => teamIds.includes(team.id));
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("*")
      .eq("tournament_id", tournamentId)
      .in("team_id", teamIds);
    if (subscriptionsError) throw subscriptionsError;

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@orhanoar.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    const title = kind === "starting" ? "¡Tu partido está por arrancar!" : "Llamado a jugadores";
    const body =
      kind === "starting"
        ? `${teams.map((team: { name: string }) => team.name).join(" vs ")} ya está en juego en ${match.field}.`
        : `${teams.map((team: { name: string }) => team.name).join(" y ")}: acérquense a ${match.field}.`;
    const payload = JSON.stringify({ title, body, url: "/", tag: `${tournamentId}-${matchId}-${kind}` });

    await Promise.allSettled(
      subscriptions.map((subscription) =>
        webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        ),
      ),
    );

    return new Response(JSON.stringify({ sent: subscriptions.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
