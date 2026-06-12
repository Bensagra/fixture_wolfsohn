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
import { loadRemoteTournament, saveRemoteTournament, supabaseEnabled } from "./supabase";
import type { Match, Team, TournamentSettings, TournamentState } from "./types";

const STORAGE_KEY = "or-hanoar-tournament-v1";
const colors = ["#00aeea", "#124b9d", "#7c4dff", "#18a77b", "#ef8f35", "#df3f63"];

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

function initialState(): TournamentState {
  const teams = ["Los Leones", "Macabi Azul", "Hanoar FC", "La Banda", "Galácticos", "Or United"].map(team);
  return {
    id: "mundial-or-hanoar",
    settings: defaultSettings,
    teams,
    matches: generateLeague(teams, defaultSettings),
    lastUpdated: new Date().toISOString(),
  };
}

function readLocal(): TournamentState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as TournamentState) : initialState();
  } catch {
    return initialState();
  }
}

interface TournamentContextValue {
  state: TournamentState;
  synced: boolean;
  supabaseEnabled: boolean;
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
  const [state, setState] = useState<TournamentState>(readLocal);
  const [synced, setSynced] = useState(!supabaseEnabled);
  const [remoteHydrated, setRemoteHydrated] = useState(!supabaseEnabled);
  const loadedRemote = useRef(false);

  useEffect(() => {
    if (!supabaseEnabled || loadedRemote.current) return;
    loadedRemote.current = true;
    loadRemoteTournament(state.id)
      .then((remote) => {
        if (remote) setState(remote);
        setSynced(true);
        setRemoteHydrated(true);
      })
      .catch(() => {
        setSynced(false);
        setRemoteHydrated(true);
      });
  }, [state.id]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!supabaseEnabled || !loadedRemote.current || !remoteHydrated) return;
    setSynced(false);
    const timer = window.setTimeout(() => {
      saveRemoteTournament(state)
        .then((saved) => setSynced(saved))
        .catch(() => setSynced(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state, remoteHydrated]);

  const mutate = useCallback((updater: (current: TournamentState) => TournamentState) => {
    setState((current) => ({
      ...updater(current),
      lastUpdated: new Date().toISOString(),
    }));
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
          if (
            current.settings.format === "knockout" &&
            target &&
            match.round > target.round
          ) {
            return {
              ...match,
              homeTeamId: null,
              awayTeamId: null,
              homeScore: null,
              awayScore: null,
              winnerTeamId: null,
              status: "pending",
            };
          }
          if (match.id !== matchId) return match;
          return {
            ...match,
            homeScore,
            awayScore,
            status: "completed",
            winnerTeamId:
              homeScore > awayScore ? match.homeTeamId : homeScore < awayScore ? match.awayTeamId : null,
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
          if (
            current.settings.format === "knockout" &&
            target &&
            match.round > target.round
          ) {
            return {
              ...match,
              homeTeamId: null,
              awayTeamId: null,
              homeScore: null,
              awayScore: null,
              winnerTeamId: null,
              status: "pending" as const,
            };
          }
          return match.id === matchId
            ? {
                ...match,
                homeScore: null,
                awayScore: null,
                winnerTeamId: null,
                status: "scheduled" as const,
              }
            : match;
        });
        if (current.settings.format === "knockout") matches = settleKnockout(matches);
        return { ...current, matches };
      }),
    [mutate],
  );

  const resetDemo = useCallback(() => setState(initialState()), []);

  const value = useMemo(
    () => ({
      state,
      synced,
      supabaseEnabled,
      addTeam,
      removeTeam,
      updateSettings,
      generateFixture,
      updateResult,
      clearResult,
      resetDemo,
    }),
    [
      state,
      synced,
      addTeam,
      removeTeam,
      updateSettings,
      generateFixture,
      updateResult,
      clearResult,
      resetDemo,
    ],
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournament() {
  const context = useContext(TournamentContext);
  if (!context) throw new Error("useTournament must be used inside TournamentProvider");
  return context;
}
