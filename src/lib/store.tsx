import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  generateGroupsAndFinals,
  generateKnockout,
  generateLeague,
  settleGroupsAndFinals,
  settleKnockout,
} from "./fixture";
import {
  deleteRemoteTournament,
  hasAdminSession,
  loadRemoteTournamentByCode,
  loadRemoteTournaments,
  saveRemoteTournament,
  sendMatchAlert,
  setRemoteMyTeam,
  subscribeToTournamentChanges,
  supabaseEnabled,
} from "./supabase";
import type {
  Match,
  Team,
  TournamentFormat,
  TournamentSettings,
  TournamentState,
} from "./types";

const STORAGE_KEY = "or-hanoar-tournaments-v3";
const ACTIVE_KEY = "or-hanoar-active-tournament";
const ASSOCIATED_CODES_KEY = "or-hanoar-associated-codes";
const MY_TEAMS_KEY = "or-hanoar-my-teams";
const colors = ["#00aeea", "#124b9d", "#7c4dff", "#18a77b", "#ef8f35", "#df3f63"];

export function normalizeAssociationCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function generateAssociationCode() {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(1000 + (value % 9000));
}

function generateUniqueAssociationCode(existingCodes: Iterable<string>) {
  const existing = new Set(Array.from(existingCodes, normalizeAssociationCode));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = generateAssociationCode();
    if (!existing.has(code)) return code;
  }
  throw new Error("No pudimos generar un código de torneo único.");
}

export function nextTimestamp(previous: string) {
  const now = Date.now();
  const previousTime = new Date(previous).getTime();
  return new Date(Math.max(now, Number.isFinite(previousTime) ? previousTime + 1 : now)).toISOString();
}

export function shouldAcceptRemoteUpdate(existing: TournamentState, updated: TournamentState) {
  const existingTime = new Date(existing.lastUpdated).getTime();
  const updatedTime = new Date(updated.lastUpdated).getTime();
  if (!Number.isFinite(existingTime) || !Number.isFinite(updatedTime)) return true;
  return updatedTime > existingTime;
}

function team(name: string, index: number): Team {
  return {
    id: crypto.randomUUID(),
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    color: colors[index % colors.length],
    createdAt: new Date().toISOString(),
  };
}

const defaultSettings: TournamentSettings = {
  title: "Mundial Or Hanoar",
  subtitle: "El torneo de nuestra comunidad",
  format: "league",
  eventDate: "2026-06-13",
  startTime: "21:00",
  matchMinutes: 20,
  fields: ["Cancha 1", "Cancha 2"],
  venue: "Roseti 50",
  published: true,
};

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "torneo"}-${Date.now().toString(36)}`;
}

export function createTournamentState(
  title = defaultSettings.title,
  format: TournamentFormat = "league",
  withDemoTeams = false,
): TournamentState {
  const settings = { ...defaultSettings, title, format, published: withDemoTeams };
  const teams = withDemoTeams
    ? ["Los Leones", "Macabi Azul", "Hanoar FC", "La Banda", "Galácticos", "Or United"].map(team)
    : [];
  return {
    id: withDemoTeams ? "mundial-or-hanoar" : slugify(title),
    associationCode: withDemoTeams ? "2026" : generateAssociationCode(),
    settings,
    teams,
    matches:
      teams.length > 1
        ? format === "league"
          ? generateLeague(teams, settings)
          : generateKnockout(teams, settings)
        : [],
    lastUpdated: new Date().toISOString(),
  };
}

function readLocal(): { tournaments: TournamentState[]; activeId: string; associatedCodes: string[]; myTeams: Record<string, string> } {
  const fallback = createTournamentState(defaultSettings.title, "league", true);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const tournaments = stored ? (JSON.parse(stored) as TournamentState[]) : [fallback];
    const migratedCodes = new Set<string>();
    const migrated = tournaments.map((item) => {
      const currentCode = normalizeAssociationCode(item.associationCode || "");
      const associationCode =
        /^\d{4}$/.test(currentCode) && !migratedCodes.has(currentCode)
          ? currentCode
          : generateUniqueAssociationCode(migratedCodes);
      migratedCodes.add(associationCode);
      return { ...item, associationCode };
    });
    const requested = localStorage.getItem(ACTIVE_KEY);
    const codes = JSON.parse(localStorage.getItem(ASSOCIATED_CODES_KEY) || "[]") as string[];
    const myTeams = JSON.parse(localStorage.getItem(MY_TEAMS_KEY) || "{}") as Record<string, string>;
    return {
      tournaments: migrated,
      activeId: migrated.some((item) => item.id === requested) ? requested! : migrated[0].id,
      associatedCodes: codes.map(normalizeAssociationCode),
      myTeams,
    };
  } catch {
    return { tournaments: [fallback], activeId: fallback.id, associatedCodes: [], myTeams: {} };
  }
}

interface TournamentContextValue {
  state: TournamentState;
  tournaments: TournamentState[];
  visibleTournaments: TournamentState[];
  activeTournamentId: string;
  hasPublicAccess: boolean;
  selectedTeamId: string | null;
  synced: boolean;
  supabaseEnabled: boolean;
  refreshTournaments: () => Promise<void>;
  syncNow: () => Promise<void>;
  associateTournament: (code: string) => Promise<"success" | "invalid" | "already-added" | "unpublished">;
  removeAssociation: (id: string) => void;
  selectTournament: (id: string) => void;
  createTournament: (title: string, format: TournamentFormat) => void;
  deleteTournament: (id: string) => void;
  regenerateAssociationCode: (id: string) => string;
  selectMyTeam: (teamId: string | null) => void;
  addTeam: (name: string, shortName?: string, color?: string) => void;
  removeTeam: (teamId: string) => void;
  updateSettings: (settings: Partial<TournamentSettings>) => void;
  generateFixture: () => void;
  updateResult: (matchId: string, homeScore: number, awayScore: number) => void;
  updateLiveScore: (matchId: string, homeScore: number, awayScore: number) => void;
  callPlayers: (matchId: string) => void;
  startMatch: (matchId: string) => void;
  finishMatch: (matchId: string) => void;
  clearResult: (matchId: string) => void;
  resetDemo: () => void;
}

const TournamentContext = createContext<TournamentContextValue | null>(null);

export function TournamentProvider({ children }: PropsWithChildren) {
  const local = useMemo(readLocal, []);
  const [tournaments, setTournaments] = useState<TournamentState[]>(local.tournaments);
  const [activeTournamentId, setActiveTournamentId] = useState(local.activeId);
  const [associatedCodes, setAssociatedCodes] = useState<string[]>(local.associatedCodes);
  const [myTeams, setMyTeams] = useState<Record<string, string>>(local.myTeams);
  const [synced, setSynced] = useState(!supabaseEnabled);
  const [remoteHydrated, setRemoteHydrated] = useState(!supabaseEnabled);
  const loadedRemote = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveGeneration = useRef(0);

  const visibleTournaments = useMemo(
    () =>
      tournaments.filter(
        (item) =>
          item.settings.published &&
          associatedCodes.includes(normalizeAssociationCode(item.associationCode)),
      ),
    [associatedCodes, tournaments],
  );
  const activeState =
    tournaments.find((item) => item.id === activeTournamentId) ??
    visibleTournaments[0] ??
    tournaments[0] ??
    createTournamentState();
  const hasPublicAccess = visibleTournaments.some((item) => item.id === activeTournamentId);
  const storedSelectedTeamId = myTeams[activeTournamentId] ?? null;
  const selectedTeamId = activeState.teams.some((item) => item.id === storedSelectedTeamId)
    ? storedSelectedTeamId
    : null;

  const refreshTournaments = useCallback(async () => {
    if (!supabaseEnabled) return;
    const isAdmin = await hasAdminSession();
    const remote = isAdmin
      ? await loadRemoteTournaments()
      : (
          await Promise.all(
            associatedCodes.map((code) => loadRemoteTournamentByCode(code).catch(() => null)),
          )
        ).filter((item): item is TournamentState => Boolean(item));
    if (remote.length || !isAdmin) {
      setTournaments(remote);
      setActiveTournamentId((current) =>
        remote.some((item) => item.id === current) ? current : remote[0]?.id ?? "",
      );
    }
    setSynced(true);
    setRemoteHydrated(true);
  }, [associatedCodes]);

  useEffect(() => {
    if (!supabaseEnabled || loadedRemote.current) return;
    loadedRemote.current = true;
    refreshTournaments().catch(() => {
      setSynced(false);
      setRemoteHydrated(true);
    });
  }, [refreshTournaments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
    localStorage.setItem(ACTIVE_KEY, activeTournamentId);
    localStorage.setItem(ASSOCIATED_CODES_KEY, JSON.stringify(associatedCodes));
    localStorage.setItem(MY_TEAMS_KEY, JSON.stringify(myTeams));
    if (!supabaseEnabled || !loadedRemote.current || !remoteHydrated) return;
    const generation = ++saveGeneration.current;
    const timer = window.setTimeout(async () => {
      if (!(await hasAdminSession())) return;
      setSynced(false);
      const snapshot = tournaments.map((tournament) => ({
        ...tournament,
        teams: [...tournament.teams],
        matches: tournament.matches.map((match) => ({ ...match })),
      }));
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => Promise.all(snapshot.map(saveRemoteTournament)))
        .then((saved) => {
          if (generation === saveGeneration.current) setSynced(saved.every(Boolean));
        })
        .catch(() => {
          if (generation === saveGeneration.current) setSynced(false);
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tournaments, activeTournamentId, associatedCodes, myTeams, remoteHydrated]);

  useEffect(() => {
    if (!supabaseEnabled) return;
    return subscribeToTournamentChanges((updated) => {
      setTournaments((current) => {
        const existing = current.find((item) => item.id === updated.id);
        if (!existing) return current;
        if (!shouldAcceptRemoteUpdate(existing, updated)) return current;
        return current.map((item) => (item.id === updated.id ? updated : item));
      });
    });
  }, []);

  useEffect(() => {
    if (!supabaseEnabled) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible" && synced) {
        refreshTournaments().catch(() => setSynced(false));
      }
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = window.setInterval(refreshIfVisible, 20000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [refreshTournaments, synced]);

  const syncNow = useCallback(async () => {
    if (!supabaseEnabled || !(await hasAdminSession())) return;
    const generation = ++saveGeneration.current;
    setSynced(false);
    const snapshot = tournaments.map((tournament) => ({
      ...tournament,
      teams: [...tournament.teams],
      matches: tournament.matches.map((match) => ({ ...match })),
    }));
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => Promise.all(snapshot.map(saveRemoteTournament)));
    try {
      const saved = (await saveQueue.current) as boolean[];
      if (generation === saveGeneration.current) setSynced(saved.every(Boolean));
    } catch {
      if (generation === saveGeneration.current) setSynced(false);
    }
  }, [tournaments]);

  const mutate = useCallback(
    (updater: (current: TournamentState) => TournamentState) => {
      setTournaments((current) =>
        current.map((item) =>
          item.id === activeTournamentId
            ? { ...updater(item), lastUpdated: nextTimestamp(item.lastUpdated) }
            : item,
        ),
      );
    },
    [activeTournamentId],
  );

  const associateTournament = useCallback(
    async (input: string) => {
      const code = normalizeAssociationCode(input);
      if (!/^\d{4}$/.test(code)) return "invalid";
      if (associatedCodes.includes(code)) return "already-added";
      const tournament = supabaseEnabled
        ? await loadRemoteTournamentByCode(code).catch(() => null)
        : tournaments.find((item) => normalizeAssociationCode(item.associationCode) === code) ?? null;
      if (!tournament) return "invalid";
      if (!tournament.settings.published) return "unpublished";
      setTournaments((current) => [
        ...current.filter((item) => item.id !== tournament.id),
        tournament,
      ]);
      setAssociatedCodes((current) => [...current, code]);
      setActiveTournamentId(tournament.id);
      return "success";
    },
    [associatedCodes, tournaments],
  );

  const removeAssociation = useCallback(
    (id: string) => {
      const tournament = tournaments.find((item) => item.id === id);
      if (!tournament) return;
      setAssociatedCodes((current) =>
        current.filter((code) => code !== normalizeAssociationCode(tournament.associationCode)),
      );
      const next = visibleTournaments.find((item) => item.id !== id);
      setActiveTournamentId(next?.id ?? "");
    },
    [tournaments, visibleTournaments],
  );

  const selectTournament = useCallback(
    (id: string) => {
      if (tournaments.some((item) => item.id === id)) setActiveTournamentId(id);
    },
    [tournaments],
  );

  const createTournament = useCallback((title: string, format: TournamentFormat) => {
    setTournaments((current) => {
      const tournament = {
        ...createTournamentState(title.trim(), format),
        associationCode: generateUniqueAssociationCode(current.map((item) => item.associationCode)),
      };
      setActiveTournamentId(tournament.id);
      return [...current, tournament];
    });
  }, []);

  const deleteTournament = useCallback(
    (id: string) => {
      if (tournaments.length <= 1) return;
      const target = tournaments.find((item) => item.id === id);
      const remaining = tournaments.filter((item) => item.id !== id);
      setTournaments(remaining);
      if (target) {
        setAssociatedCodes((current) =>
          current.filter((code) => code !== normalizeAssociationCode(target.associationCode)),
        );
      }
      if (activeTournamentId === id) setActiveTournamentId(remaining[0].id);
      if (supabaseEnabled) deleteRemoteTournament(id).catch(() => setSynced(false));
    },
    [activeTournamentId, tournaments],
  );

  const regenerateAssociationCode = useCallback((id: string) => {
    const code = generateUniqueAssociationCode(
      tournaments.filter((item) => item.id !== id).map((item) => item.associationCode),
    );
    setTournaments((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, associationCode: code, lastUpdated: new Date().toISOString() }
          : item,
      ),
    );
    return code;
  }, [tournaments]);

  const selectMyTeam = useCallback(
    (teamId: string | null) => {
      setMyTeams((current) => {
        const next = { ...current };
        if (teamId) next[activeTournamentId] = teamId;
        else delete next[activeTournamentId];
        return next;
      });
      if (supabaseEnabled) setRemoteMyTeam(activeTournamentId, teamId).catch(() => setSynced(false));
    },
    [activeTournamentId],
  );

  const addTeam = useCallback(
    (name: string, shortName?: string, color?: string) =>
      mutate((current) => ({
        ...current,
        teams: [
          ...current.teams,
          {
            ...team(name.trim(), current.teams.length),
            shortName: shortName?.trim().toUpperCase() || name.slice(0, 3).toUpperCase(),
            color: color || colors[current.teams.length % colors.length],
          },
        ],
      })),
    [mutate],
  );

  const removeTeam = useCallback(
    (teamId: string) =>
      mutate((current) => ({
        ...current,
        teams: current.teams.filter((item) => item.id !== teamId),
      })),
    [mutate],
  );

  const updateSettings = useCallback(
    (settings: Partial<TournamentSettings>) =>
      mutate((current) => ({
        ...current,
        settings: { ...current.settings, ...settings },
      })),
    [mutate],
  );

  const generateFixture = useCallback(
    () =>
      mutate((current) => {
        const matches =
          current.settings.format === "league"
            ? generateLeague(current.teams, current.settings)
            : current.settings.format === "knockout"
              ? generateKnockout(current.teams, current.settings)
              : generateGroupsAndFinals(current.teams, current.settings);
        return { ...current, matches };
      }),
    [mutate],
  );

  const settleMatches = useCallback((current: TournamentState, matches: Match[]) => {
    if (current.settings.format === "knockout") return settleKnockout(matches);
    if (current.settings.format === "groups") return settleGroupsAndFinals(current.teams, matches);
    return matches;
  }, []);

  const updateResult = useCallback(
    (matchId: string, homeScore: number, awayScore: number) =>
      mutate((current) => {
        const target = current.matches.find((match) => match.id === matchId);
        let matches: Match[] = current.matches.map((match) => {
          if (current.settings.format === "knockout" && target && match.round > target.round) {
            return { ...match, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, winnerTeamId: null, status: "pending" };
          }
          if (match.id !== matchId) return match;
          return {
            ...match,
            homeScore,
            awayScore,
            status: "completed",
            winnerTeamId: homeScore > awayScore ? match.homeTeamId : homeScore < awayScore ? match.awayTeamId : null,
          };
        });
        if (current.settings.format === "groups" && target?.stage === "group") {
          matches = matches.map((match) =>
            match.stage === "semifinal" || match.stage === "final"
              ? { ...match, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, winnerTeamId: null, status: "pending" as const, startedAt: null }
              : match,
          );
        }
        matches = settleMatches(current, matches);
        return { ...current, matches };
      }),
    [mutate, settleMatches],
  );

  const updateLiveScore = useCallback(
    (matchId: string, homeScore: number, awayScore: number) =>
      mutate((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.id === matchId ? { ...match, homeScore, awayScore } : match,
        ),
      })),
    [mutate],
  );

  const callPlayers = useCallback(
    (matchId: string) => {
      mutate((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.id === matchId ? { ...match, calledAt: new Date().toISOString() } : match,
        ),
      }));
      if (supabaseEnabled) sendMatchAlert(activeTournamentId, matchId, "called").catch(() => undefined);
    },
    [activeTournamentId, mutate],
  );

  const startMatch = useCallback(
    (matchId: string) => {
      mutate((current) => ({
        ...current,
        matches: current.matches.map((match) =>
          match.id === matchId
            ? {
                ...match,
                status: "live",
                startedAt: new Date().toISOString(),
                homeScore: match.homeScore ?? 0,
                awayScore: match.awayScore ?? 0,
              }
            : match,
        ),
      }));
      if (supabaseEnabled) sendMatchAlert(activeTournamentId, matchId, "starting").catch(() => undefined);
    },
    [activeTournamentId, mutate],
  );

  const finishMatch = useCallback(
    (matchId: string) =>
      mutate((current) => {
        const target = current.matches.find((match) => match.id === matchId);
        let matches = current.matches.map((match) =>
          match.id === matchId
            ? {
                ...match,
                status: "completed" as const,
                winnerTeamId:
                  (match.homeScore ?? 0) > (match.awayScore ?? 0)
                    ? match.homeTeamId
                    : (match.homeScore ?? 0) < (match.awayScore ?? 0)
                      ? match.awayTeamId
                      : null,
              }
            : match,
        );
        if (current.settings.format === "groups" && target?.stage === "group") {
          matches = matches.map((match) =>
            match.stage === "semifinal" || match.stage === "final"
              ? { ...match, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, winnerTeamId: null, status: "pending" as const, startedAt: null }
              : match,
          );
        }
        return { ...current, matches: settleMatches(current, matches) };
      }),
    [mutate, settleMatches],
  );

  const clearResult = useCallback(
    (matchId: string) =>
      mutate((current) => {
        const target = current.matches.find((match) => match.id === matchId);
        let matches = current.matches.map((match) => {
          if (current.settings.format === "knockout" && target && match.round > target.round) {
            return { ...match, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, winnerTeamId: null, status: "pending" as const };
          }
          return match.id === matchId
            ? { ...match, homeScore: null, awayScore: null, winnerTeamId: null, status: "scheduled" as const, startedAt: null }
            : match;
        });
        if (current.settings.format === "groups" && target?.stage === "group") {
          matches = matches.map((match) =>
            match.stage === "semifinal" || match.stage === "final"
              ? { ...match, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, winnerTeamId: null, status: "pending" as const, startedAt: null }
              : match,
          );
        }
        matches = settleMatches(current, matches);
        return { ...current, matches };
      }),
    [mutate, settleMatches],
  );

  const resetDemo = useCallback(
    () =>
      mutate((current) => {
        const demo = createTournamentState(defaultSettings.title, "league", true);
        return { ...demo, id: activeTournamentId, associationCode: current.associationCode };
      }),
    [activeTournamentId, mutate],
  );

  const value = useMemo(
    () => ({
      state: activeState,
      tournaments,
      visibleTournaments,
      activeTournamentId,
      hasPublicAccess,
      selectedTeamId,
      synced,
      supabaseEnabled,
      refreshTournaments,
      syncNow,
      associateTournament,
      removeAssociation,
      selectTournament,
      createTournament,
      deleteTournament,
      regenerateAssociationCode,
      selectMyTeam,
      addTeam,
      removeTeam,
      updateSettings,
      generateFixture,
      updateResult,
      updateLiveScore,
      callPlayers,
      startMatch,
      finishMatch,
      clearResult,
      resetDemo,
    }),
    [
      activeState, tournaments, visibleTournaments, activeTournamentId, hasPublicAccess, selectedTeamId, synced,
      refreshTournaments, syncNow, associateTournament, removeAssociation, selectTournament, createTournament,
      deleteTournament, regenerateAssociationCode, selectMyTeam, addTeam, removeTeam, updateSettings, generateFixture,
      updateResult, updateLiveScore, callPlayers, startMatch, finishMatch, clearResult, resetDemo,
    ],
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournament() {
  const context = useContext(TournamentContext);
  if (!context) throw new Error("useTournament must be used inside TournamentProvider");
  return context;
}
