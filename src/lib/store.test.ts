import { describe, expect, it } from "vitest";
import {
  createTournamentState,
  generateAssociationCode,
  nextTimestamp,
  normalizeAssociationCode,
  shouldAcceptRemoteUpdate,
} from "./store";

describe("múltiples torneos", () => {
  it("crea torneos independientes con identificadores únicos", () => {
    const league = createTournamentState("Liga Secundaria", "league");
    const cup = createTournamentState("Copa Primaria", "knockout");

    expect(league.id).not.toBe(cup.id);
    expect(league.settings.title).toBe("Liga Secundaria");
    expect(cup.settings.title).toBe("Copa Primaria");
    expect(league.settings.format).toBe("league");
    expect(cup.settings.format).toBe("knockout");
    expect(league.settings.published).toBe(false);
    expect(cup.settings.published).toBe(false);
    expect(league.associationCode).toHaveLength(6);
    expect(cup.associationCode).toHaveLength(6);
    expect(league.associationCode).not.toBe(cup.associationCode);
    expect(league.teams).not.toBe(cup.teams);
    expect(league.matches).not.toBe(cup.matches);
  });

  it("normaliza códigos y evita caracteres confusos", () => {
    expect(normalizeAssociationCode(" or-20 26 ")).toBe("OR2026");
    expect(generateAssociationCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("ignora ecos realtime viejos y mantiene timestamps crecientes", () => {
    const local = createTournamentState("En vivo", "league");
    local.lastUpdated = "2026-06-13T20:00:00.100Z";
    const echo = { ...local, lastUpdated: "2026-06-13T20:00:00.100Z" };
    const old = { ...local, lastUpdated: "2026-06-13T20:00:00.000Z" };
    const newer = { ...local, lastUpdated: "2026-06-13T20:00:00.200Z" };

    expect(shouldAcceptRemoteUpdate(local, echo)).toBe(false);
    expect(shouldAcceptRemoteUpdate(local, old)).toBe(false);
    expect(shouldAcceptRemoteUpdate(local, newer)).toBe(true);
    expect(new Date(nextTimestamp(local.lastUpdated)).getTime()).toBeGreaterThan(
      new Date(local.lastUpdated).getTime(),
    );
  });
});
