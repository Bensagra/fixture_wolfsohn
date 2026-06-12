import type {
  Match,
  Standing,
  Team,
  TournamentSettings,
} from "./types";

const id = () => crypto.randomUUID();

function scheduledDate(
  settings: TournamentSettings,
  matchIndex: number,
): { scheduledAt: string; field: string } {
  const fields = settings.fields.length ? settings.fields : ["Cancha 1"];
  const [hours, minutes] = settings.startTime.split(":").map(Number);
  const date = new Date(`${settings.eventDate}T00:00:00`);
  date.setHours(hours, minutes + Math.floor(matchIndex / fields.length) * settings.matchMinutes);
  return {
    scheduledAt: date.toISOString(),
    field: fields[matchIndex % fields.length],
  };
}

export function generateLeague(
  teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const rotation: (Team | null)[] = [...teams];
  if (rotation.length % 2 !== 0) rotation.push(null);
  const rounds = rotation.length - 1;
  const half = rotation.length / 2;
  const matches: Match[] = [];
  let matchIndex = 0;

  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < half; i += 1) {
      const first = rotation[i];
      const second = rotation[rotation.length - 1 - i];
      if (!first || !second) continue;
      const swap = (round + i) % 2 === 1;
      const schedule = scheduledDate(settings, matchIndex);
      matches.push({
        id: id(),
        round: round + 1,
        roundLabel: `Fecha ${round + 1}`,
        order: i,
        homeTeamId: swap ? second.id : first.id,
        awayTeamId: swap ? first.id : second.id,
        homeScore: null,
        awayScore: null,
        status: "scheduled",
        ...schedule,
      });
      matchIndex += 1;
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return matches;
}

function nextPowerOfTwo(value: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 2)));
}

function roundName(round: number, totalRounds: number) {
  const remaining = totalRounds - round - 1;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinal";
  if (remaining === 2) return "Cuartos de final";
  if (remaining === 3) return "Octavos de final";
  return `Ronda ${round + 1}`;
}

export function generateKnockout(
  teams: Team[],
  settings: TournamentSettings,
): Match[] {
  const size = nextPowerOfTwo(teams.length);
  const totalRounds = Math.log2(size);
  const matches: Match[] = [];
  const byRound: Match[][] = [];
  let matchIndex = 0;

  for (let round = 0; round < totalRounds; round += 1) {
    const count = size / 2 ** (round + 1);
    const roundMatches: Match[] = [];
    for (let order = 0; order < count; order += 1) {
      const schedule = scheduledDate(settings, matchIndex);
      const match: Match = {
        id: id(),
        round: round + 1,
        roundLabel: roundName(round, totalRounds),
        order,
        homeTeamId: null,
        awayTeamId: null,
        homeScore: null,
        awayScore: null,
        status: round === 0 ? "scheduled" : "pending",
        sourceMatchIds: [],
        ...schedule,
      };
      roundMatches.push(match);
      matches.push(match);
      matchIndex += 1;
    }
    byRound.push(roundMatches);
  }

  const firstRound = byRound[0];
  teams.forEach((team, index) => {
    const slotIndex =
      index < firstRound.length ? index * 2 : (index - firstRound.length) * 2 + 1;
    const match = firstRound[Math.floor(slotIndex / 2)];
    if (slotIndex % 2 === 0) match.homeTeamId = team.id;
    else match.awayTeamId = team.id;
  });

  for (let round = 0; round < byRound.length - 1; round += 1) {
    byRound[round].forEach((match, index) => {
      const next = byRound[round + 1][Math.floor(index / 2)];
      match.nextMatchId = next.id;
      match.nextSlot = index % 2 === 0 ? "home" : "away";
      next.sourceMatchIds!.push(match.id);
    });
  }

  return settleKnockout(matches);
}

export function settleKnockout(input: Match[]): Match[] {
  const matches = input.map((match) => ({ ...match }));
  const byId = new Map(matches.map((match) => [match.id, match]));
  let changed = true;

  while (changed) {
    changed = false;
    matches
      .sort((a, b) => a.round - b.round || a.order - b.order)
      .forEach((match) => {
        const sourcesResolved =
          !match.sourceMatchIds?.length ||
          match.sourceMatchIds.every((sourceId) => {
            const source = byId.get(sourceId);
            return source?.status === "completed" || source?.status === "bye";
          });

        const populated = [match.homeTeamId, match.awayTeamId].filter(Boolean);
        if (sourcesResolved && match.status === "pending" && populated.length === 2) {
          match.status = "scheduled";
          changed = true;
        }
        if (
          sourcesResolved &&
          (match.status === "pending" || match.status === "scheduled") &&
          populated.length < 2
        ) {
          match.status = "bye";
          match.winnerTeamId = populated[0] ?? null;
          changed = true;
        }
        if (
          (match.status === "completed" || match.status === "bye") &&
          match.nextMatchId &&
          match.winnerTeamId &&
          match.nextSlot
        ) {
          const next = byId.get(match.nextMatchId);
          if (next) {
            const currentTeam = match.nextSlot === "home" ? next.homeTeamId : next.awayTeamId;
            if (currentTeam !== match.winnerTeamId) {
              if (match.nextSlot === "home") next.homeTeamId = match.winnerTeamId;
              else next.awayTeamId = match.winnerTeamId;
              changed = true;
            }
          }
        }
      });
  }

  return matches.sort((a, b) => a.round - b.round || a.order - b.order);
}

export function calculateStandings(teams: Team[], matches: Match[]): Standing[] {
  const standings = new Map<string, Standing>();
  teams.forEach((team) =>
    standings.set(team.id, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    }),
  );

  matches
    .filter(
      (match) =>
        match.status === "completed" &&
        match.homeTeamId &&
        match.awayTeamId &&
        match.homeScore !== null &&
        match.awayScore !== null,
    )
    .forEach((match) => {
      const home = standings.get(match.homeTeamId!);
      const away = standings.get(match.awayTeamId!);
      if (!home || !away) return;
      home.played += 1;
      away.played += 1;
      home.goalsFor += match.homeScore!;
      home.goalsAgainst += match.awayScore!;
      away.goalsFor += match.awayScore!;
      away.goalsAgainst += match.homeScore!;
      if (match.homeScore! > match.awayScore!) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (match.homeScore! < match.awayScore!) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    });

  return [...standings.values()]
    .map((standing) => ({
      ...standing,
      goalDifference: standing.goalsFor - standing.goalsAgainst,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.team.name.localeCompare(b.team.name),
    );
}
