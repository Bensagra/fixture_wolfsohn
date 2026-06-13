export type TournamentFormat = "league" | "knockout" | "groups";
export type MatchStatus = "pending" | "scheduled" | "live" | "completed" | "bye";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  createdAt: string;
}

export interface Match {
  id: string;
  round: number;
  roundLabel: string;
  order: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId?: string | null;
  status: MatchStatus;
  stage?: "league" | "group" | "semifinal" | "final";
  group?: "A" | "B";
  scheduledAt: string;
  field: string;
  calledAt?: string | null;
  startedAt?: string | null;
  nextMatchId?: string;
  nextSlot?: "home" | "away";
  sourceMatchIds?: string[];
}

export interface TournamentSettings {
  title: string;
  subtitle: string;
  format: TournamentFormat;
  leagueLegs: 1 | 2;
  eventDate: string;
  startTime: string;
  matchMinutes: number;
  fields: string[];
  venue: string;
  published: boolean;
}

export interface TournamentState {
  id: string;
  associationCode: string;
  settings: TournamentSettings;
  teamCatalog: Team[];
  teams: Team[];
  matches: Match[];
  lastUpdated: string;
}

export interface Standing {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
