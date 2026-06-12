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
import { generateKnockout, generateLeague, settleKnockout } from "./fixture";
import {
  deleteRemoteTournament,
  hasAdminSession,
  loadRemoteTournamentByCode,
  loadRemoteTournaments,
  saveRemoteTournament,
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
const colors = ["#00aeea", "#124b9d", "#7c4dff", "#18a77b", "#ef8f35", "#df3f63"];

export function normalizeAssociationCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateAssociationCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (value) => alphabet[value % alphabet.length],
  ).join("");
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
    associationCode: withDemoTeams ? "OR2026" : generateAssociationCode(),
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

function readLocal(): { tournaments: TournamentState[]; activeId: string; associatedCodes: string[] } {
  const fallback = createTournamentState(defaultSettings.title, "league", true);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const tournaments = stored ? (JSON.parse(stored) as TournamentState[]) : [fallback];
    const migrated = tournaments.map((item) => ({
      ...item,
      associationCode: item.associationCode || generateAssociationCode(),
    }));
    const requested = localStorage.getItem(ACTIVE_KEY);
    const codes = JSON.parse(localStorage.getItem(ASSOCIATED_CODES_KEY) || "[]") as string[];
    return {
      tournaments: migrated,
      activeId: migrated.some((item) => item.id === requested) ? requested! : migrated[0].id,
      associatedCodes: codes.map(normalizeAssociationCode),
    };
  } catch {
    return { tournaments: [fallback], activeId: fallback.id, associatedCodes: [] };
  }
}

interface TournamentContextValue {
  state: TournamentState;
  tournaments: TournamentState[];
  visibleTournaments: TournamentState[];
  activeTournamentId: string;
  hasPublicAccess: boolean;
  synced: boolean;
  supabaseEnabled: boolean;
  refreshTournaments: () => Promise<void>;
  associateTournament: (code: string) => Promise<"success" | "invalid" | "already-added" | "unpublished">;
  removeAssociation: (id: string) => void;
  selectTournament: (id: string) => void;
  createTournament: (title: string, format: TournamentFormat) => void;
  deleteTournament: (id: string) => void;
  regenerateAssociationCode: (id: string) => string;
  addTeam: (name: string, shortName?: string, color?: string) => void;
  removeTeam: (teamId: string) => void;
  updateSettings: (settings: Partial<TournamentSettings>) => void;
  generateFixture: () => void;
  updateResult: (matchId: string, homeScore: number, awayScore: number) => void;
  clearResult: (matchId: string) => void;
  resetDemo: () => void;
}

const TournamentContext = createContext<TournamentContextValue | null>(null);

export function TournamentProvider({ children }: PropsWithChildren) {
  const local = useMemo(readLocal, []);
  const [tournaments, setTournaments] = useState<TournamentState[]>(local.tournaments);
  const [activeTournamentId, setActiveTournamentId] = useState(local.activeId);
  const [associatedCodes, setAssociatedCodes] = useState<string[]>(local.associatedCodes);
  const [synced, setSynced] = useState(!supabaseEnabled);
  const [remoteHydrated, setRemoteHydrated] = useState(!supabaseEnabled);
  const loadedRemote = useRef(false);

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
    if (!supabaseEnabled || !loadedRemote.current || !remoteHydrated) return;
    const timer = window.setTimeout(async () => {
      if (!(await hasAdminSession())) return;
      setSynced(false);
      Promise.all(tournaments.map(saveRemoteTournament))
        .then((saved) => setSynced(saved.every(Boolean)))
        .catch(() => setSynced(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tournaments, activeTournamentId, associatedCodes, remoteHydrated]);

  const mutate = useCallback(
    (updater: (current: TournamentState) => TournamentState) => {
      setTournaments((current) =>
        current.map((item) =>
          item.id === activeTournamentId
            ? { ...updater(item), lastUpdated: new Date().toISOString() }
            : item,
        ),
      );
    },
    [activeTournamentId],
  );

  const associateTournament = useCallback(
    async (input: string) => {
      const code = normalizeAssociationCode(input);
      if (!code) return "invalid";
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
    const tournament = createTournamentState(title.trim(), format);
    setTournaments((current) => [...current, tournament]);
    setActiveTournamentId(tournament.id);
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
    const code = generateAssociationCode();
    setTournaments((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, associationCode: code, lastUpdated: new Date().toISOString() }
          : item,
      ),
    );
    return code;
  }, []);

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
      mutate((current) => ({
        ...current,
        matches:
          current.settings.format === "league"
            ? generateLeague(current.teams, current.settings)
            : generateKnockout(current.teams, current.settings),
      })),
    [mutate],
  );

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
        if (current.settings.format === "knockout") matches = settleKnockout(matches);
        return { ...current, matches };
      }),
    [mutate],
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
            ? { ...match, homeScore: null, awayScore: null, winnerTeamId: null, status: "scheduled" as const }
            : match;
        });
        if (current.settings.format === "knockout") matches = settleKnockout(matches);
        return { ...current, matches };
      }),
    [mutate],
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
      synced,
      supabaseEnabled,
      refreshTournaments,
      associateTournament,
      removeAssociation,
      selectTournament,
      createTournament,
      deleteTournament,
      regenerateAssociationCode,
      addTeam,
      removeTeam,
      updateSettings,
      generateFixture,
      updateResult,
      clearResult,
      resetDemo,
    }),
    [
      activeState, tournaments, visibleTournaments, activeTournamentId, hasPublicAccess, synced,
      refreshTournaments, associateTournament, removeAssociation, selectTournament, createTournament,
      deleteTournament, regenerateAssociationCode, addTeam, removeTeam, updateSettings, generateFixture,
      updateResult, clearResult, resetDemo,
    ],
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournament() {
  const context = useContext(TournamentContext);
  if (!context) throw new Error("useTournament must be used inside TournamentProvider");
  return context;
}
