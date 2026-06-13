import { describe, expect, it } from "vitest";
import {
  calculateStandings,
  generateGroupsAndFinals,
  generateKnockout,
  generateLeague,
  settleGroupsAndFinals,
  settleKnockout,
} from "./fixture";
import type { Team, TournamentSettings } from "./types";

const settings: TournamentSettings = {
  title: "Test",
  subtitle: "Test",
  format: "league",
  eventDate: "2026-06-13",
  startTime: "21:00",
  matchMinutes: 20,
  fields: ["Cancha 1", "Cancha 2"],
  venue: "Test",
  published: true,
};

const teams = (count: number): Team[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Equipo ${index + 1}`,
    shortName: `E${index + 1}`,
    color: "#00aeea",
    createdAt: "2026-06-12T00:00:00.000Z",
  }));

describe("fixture de liga", () => {
  it.each([3, 4, 5, 7, 10])("genera todos los cruces para %i equipos", (count) => {
    const matches = generateLeague(teams(count), settings);
    expect(matches).toHaveLength((count * (count - 1)) / 2);
    expect(new Set(matches.map((match) => match.id)).size).toBe(matches.length);
  });

  it("calcula la tabla de posiciones", () => {
    const participants = teams(3);
    const matches = generateLeague(participants, settings);
    matches[0] = { ...matches[0], status: "completed", homeScore: 2, awayScore: 0 };
    const standings = calculateStandings(participants, matches);
    expect(standings[0].points).toBe(3);
    expect(standings[0].goalDifference).toBe(2);
  });
});

describe("fixture eliminatorio", () => {
  it.each([2, 3, 5, 6, 7, 10])("genera una llave válida para %i equipos", (count) => {
    const matches = generateKnockout(teams(count), { ...settings, format: "knockout" });
    const bracketSize = 2 ** Math.ceil(Math.log2(count));
    expect(matches).toHaveLength(bracketSize - 1);
    expect(matches.filter((match) => match.roundLabel === "Final")).toHaveLength(1);
    expect(matches.filter((match) => match.status === "bye")).toHaveLength(bracketSize - count);
  });

  it("avanza ganadores hasta la final", () => {
    let matches = generateKnockout(teams(4), { ...settings, format: "knockout" });
    const semifinals = matches.filter((match) => match.roundLabel === "Semifinal");
    matches = matches.map((match) =>
      match.id === semifinals[0].id
        ? { ...match, status: "completed", homeScore: 2, awayScore: 0, winnerTeamId: match.homeTeamId }
        : match.id === semifinals[1].id
          ? { ...match, status: "completed", homeScore: 0, awayScore: 1, winnerTeamId: match.awayTeamId }
          : match,
    );
    matches = settleKnockout(matches);
    const final = matches.find((match) => match.roundLabel === "Final")!;
    expect(final.homeTeamId).toBe(semifinals[0].homeTeamId);
    expect(final.awayTeamId).toBe(semifinals[1].awayTeamId);
    expect(final.status).toBe("scheduled");
  });
});

describe("fase de grupos más finales", () => {
  it("genera dos grupos, semifinales y final", () => {
    const participants = teams(8);
    const matches = generateGroupsAndFinals(participants, { ...settings, format: "groups" });
    expect(matches.filter((match) => match.group === "A")).toHaveLength(6);
    expect(matches.filter((match) => match.group === "B")).toHaveLength(6);
    expect(matches.filter((match) => match.stage === "semifinal")).toHaveLength(2);
    expect(matches.filter((match) => match.stage === "final")).toHaveLength(1);
  });

  it("clasifica automáticamente a semifinales", () => {
    const participants = teams(8);
    let matches = generateGroupsAndFinals(participants, { ...settings, format: "groups" });
    matches = matches.map((match) =>
      match.stage === "group"
        ? { ...match, status: "completed", homeScore: 1, awayScore: 0, winnerTeamId: match.homeTeamId }
        : match,
    );
    matches = settleGroupsAndFinals(participants, matches);
    const semifinals = matches.filter((match) => match.stage === "semifinal");
    expect(semifinals.every((match) => match.status === "scheduled")).toBe(true);
    expect(semifinals.every((match) => match.homeTeamId && match.awayTeamId)).toBe(true);
    expect(matches.find((match) => match.stage === "final")?.status).toBe("pending");
  });
});
