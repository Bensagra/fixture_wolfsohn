import {
  CalendarDays,
  Bell,
  BellRing,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  Flag,
  Home,
  KeyRound,
  ListFilter,
  LockKeyhole,
  MapPin,
  Medal,
  Menu,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCcw,
  Settings,
  Shield,
  Sparkles,
  Square,
  Swords,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { calculateStandings } from "./lib/fixture";
import { enableTeamNotifications, notificationsSupported } from "./lib/notifications";
import { useTournament } from "./lib/store";
import { hasAdminSession, signInAdmin } from "./lib/supabase";
import type { Match, Team, TournamentFormat } from "./lib/types";

type View = "inicio" | "partidos" | "competencia" | "equipos" | "admin";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

const formatLabel = (format: TournamentFormat) =>
  format === "league" ? "Liga" : format === "knockout" ? "Eliminatorias" : "Grupos + finales";

function LiveMinute({ startedAt }: { startedAt?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  if (!startedAt) return <>En vivo</>;
  const minutes = Math.max(1, Math.floor((now - new Date(startedAt).getTime()) / 60000) + 1);
  return <><Radio size={11} /> {minutes}'</>;
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-logo ${small ? "brand-logo--small" : ""}`}>
      <img src="/or-hanoar-logo.png" alt="Logo Or Hanoar" />
    </div>
  );
}

function TeamMark({ team, compact = false }: { team?: Team; compact?: boolean }) {
  if (!team) {
    return (
      <span className={`team-mark team-mark--empty ${compact ? "team-mark--compact" : ""}`}>
        ?
      </span>
    );
  }
  return (
    <span
      className={`team-mark ${compact ? "team-mark--compact" : ""}`}
      style={{ background: `linear-gradient(145deg, ${team.color}, ${team.color}a8)` }}
    >
      {team.shortName.slice(0, 3)}
    </span>
  );
}

function StatusPill({ status }: { status: Match["status"] }) {
  if (status === "completed") return <span className="pill pill--done"><Check size={12} /> Final</span>;
  if (status === "live") return <span className="pill pill--playing"><Radio size={12} /> En vivo</span>;
  if (status === "bye") return <span className="pill">Pase libre</span>;
  if (status === "pending") return <span className="pill pill--muted">A confirmar</span>;
  return <span className="pill pill--live">Próximo</span>;
}

function MatchCard({
  match,
  teams,
  onEdit,
  featured = false,
}: {
  match: Match;
  teams: Team[];
  onEdit?: (match: Match) => void;
  featured?: boolean;
}) {
  const home = teams.find((team) => team.id === match.homeTeamId);
  const away = teams.find((team) => team.id === match.awayTeamId);
  return (
    <article className={`match-card ${featured ? "match-card--featured" : ""}`}>
      <div className="match-card__meta">
        <span>{match.roundLabel}</span>
        <StatusPill status={match.status} />
      </div>
      <div className="match-card__teams">
        <div className="match-team">
          <TeamMark team={home} />
          <strong>{home?.name ?? "A definir"}</strong>
        </div>
        <div className="match-score">
          {match.status === "completed" || match.status === "live" ? (
            <>
              <strong>{match.homeScore}</strong>
              <span>:</span>
              <strong>{match.awayScore}</strong>
            </>
          ) : (
            <>
              <span className="score-vs">VS</span>
            </>
          )}
        </div>
        <div className="match-team match-team--away">
          <TeamMark team={away} />
          <strong>{away?.name ?? "A definir"}</strong>
        </div>
      </div>
      <div className="match-card__footer">
        {match.status === "live" ? <span className="live-minute"><LiveMinute startedAt={match.startedAt} /></span> : null}
        {match.calledAt && match.status === "scheduled" ? <span className="called-indicator"><BellRing size={13} /> Jugadores llamados</span> : null}
        <span><CalendarDays size={14} /> {formatDate(match.scheduledAt)}</span>
        <span><Clock3 size={14} /> {formatTime(match.scheduledAt)}</span>
        <span><MapPin size={14} /> {match.field}</span>
        {onEdit && match.homeTeamId && match.awayTeamId && match.status !== "bye" ? (
          <button className="icon-button" onClick={() => onEdit(match)} aria-label="Editar resultado">
            <Pencil size={15} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function HomeView({ navigate }: { navigate: (view: View) => void }) {
  const { state } = useTournament();
  const [titleLead, ...titleRest] = state.settings.title.split(" ");
  const playable = state.matches.filter((match) => match.status === "scheduled");
  const live = state.matches.filter((match) => match.status === "live");
  const completed = state.matches.filter((match) => match.status === "completed");
  const next = playable[0];
  const champion =
    state.settings.format !== "league"
      ? state.teams.find(
          (team) =>
            team.id ===
            state.matches.find((match) => match.roundLabel === "Final" && match.status === "completed")
              ?.winnerTeamId,
        )
      : undefined;

  return (
    <>
      <section className="hero">
        <div className="hero__glow" />
        <div className="hero__content">
          <div className="hero__brand">
            <Logo />
            <div>
              <span className="hero__kicker">Comunidad Or Hanoar presenta</span>
              <h1>{titleLead}<br /><em>{titleRest.join(" ") || "Or Hanoar"}</em></h1>
            </div>
          </div>
          <p>{state.settings.subtitle}</p>
          <div className="hero__facts">
            <span><CalendarDays size={17} /> {formatDate(`${state.settings.eventDate}T12:00:00`)}</span>
            <span><MapPin size={17} /> {state.settings.venue}</span>
            <span><Swords size={17} /> {formatLabel(state.settings.format)}</span>
          </div>
        </div>
      </section>

      <div className="page-content page-content--home">
        <section className="stats-grid">
          <button className="stat-card" onClick={() => navigate("equipos")}>
            <span className="stat-card__icon"><Shield size={20} /></span>
            <strong>{state.teams.length}</strong>
            <span>equipos</span>
          </button>
          <button className="stat-card" onClick={() => navigate("partidos")}>
            <span className="stat-card__icon"><Swords size={20} /></span>
            <strong>{state.matches.length}</strong>
            <span>partidos</span>
          </button>
          <button className="stat-card" onClick={() => navigate("competencia")}>
            <span className="stat-card__icon"><Trophy size={20} /></span>
            <strong>{completed.length}</strong>
            <span>jugados</span>
          </button>
        </section>

        <MyTeamCard />

        {live.length ? (
          <section>
            <SectionHeader eyebrow="Ahora mismo" title="Partidos en vivo" />
            <div className="card-list">
              {live.map((match) => <MatchCard key={match.id} match={match} teams={state.teams} featured />)}
            </div>
          </section>
        ) : null}

        {champion ? (
          <section className="champion-card">
            <Crown size={30} />
            <div>
              <span>Campeón del torneo</span>
              <strong>{champion.name}</strong>
            </div>
            <TeamMark team={champion} />
          </section>
        ) : null}

        <section>
          <SectionHeader
            eyebrow="La previa"
            title="Próximo partido"
            action={<button className="text-button" onClick={() => navigate("partidos")}>Ver todos <ChevronRight size={15} /></button>}
          />
          {next ? (
            <MatchCard match={next} teams={state.teams} featured />
          ) : (
            <EmptyState icon={<Trophy />} title="Fixture completado" text="Todos los partidos ya tienen resultado." />
          )}
        </section>

        <section>
          <SectionHeader eyebrow="En juego" title="Últimos resultados" />
          <div className="card-list">
            {completed.slice(-3).reverse().map((match) => (
              <MatchCard key={match.id} match={match} teams={state.teams} />
            ))}
            {!completed.length ? (
              <EmptyState icon={<Flag />} title="Todavía no empezó" text="Los resultados van a aparecer acá." />
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

function MatchesView() {
  const { state } = useTournament();
  const rounds = [...new Set(state.matches.map((match) => match.roundLabel))];
  const [round, setRound] = useState("Todos");
  const visible = round === "Todos" ? state.matches : state.matches.filter((match) => match.roundLabel === round);

  return (
    <div className="page-content">
      <PageIntro eyebrow="Calendario oficial" title="Partidos" text="Horarios, canchas y resultados del torneo." />
      <div className="filter-scroll">
        {["Todos", ...rounds].map((item) => (
          <button key={item} className={round === item ? "filter-chip active" : "filter-chip"} onClick={() => setRound(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="round-groups">
        {(round === "Todos" ? rounds : [round]).map((roundName) => (
          <section key={roundName}>
            <SectionHeader title={roundName} eyebrow={`${state.matches.filter((match) => match.roundLabel === roundName).length} partidos`} />
            <div className="card-list">
              {visible.filter((match) => match.roundLabel === roundName).map((match) => (
                <MatchCard key={match.id} match={match} teams={state.teams} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CompetitionView() {
  const { state } = useTournament();
  return state.settings.format === "league" ? <StandingsView /> : state.settings.format === "groups" ? <GroupsView /> : <BracketView />;
}

function StandingsTable({ teams, matches }: { teams: Team[]; matches: Match[] }) {
  const standings = calculateStandings(teams, matches);
  return (
    <div className="table-card">
      <div className="standings-row standings-row--head">
        <span>#</span><span>Equipo</span><span>PJ</span><span>DG</span><span>PTS</span>
      </div>
      {standings.map((standing, index) => (
        <div className="standings-row" key={standing.team.id}>
          <strong className={index < 2 ? `position position--${index + 1}` : "position"}>{index + 1}</strong>
          <div className="standing-team"><TeamMark team={standing.team} compact /><span>{standing.team.name}</span></div>
          <span>{standing.played}</span>
          <span>{standing.goalDifference > 0 ? "+" : ""}{standing.goalDifference}</span>
          <strong>{standing.points}</strong>
        </div>
      ))}
    </div>
  );
}

function StandingsView() {
  const { state } = useTournament();
  const standings = calculateStandings(state.teams, state.matches);
  return (
    <div className="page-content">
      <PageIntro eyebrow="Modo liga" title="Tabla de posiciones" text="Tres puntos por victoria, uno por empate." />
      <StandingsTable teams={standings.map((item) => item.team)} matches={state.matches} />
      <div className="legend-card">
        <span><Medal size={16} /> Desempate</span>
        <p>Por puntos, diferencia de gol y goles a favor.</p>
      </div>
    </div>
  );
}

function GroupsView() {
  const { state } = useTournament();
  const groupMatches = state.matches.filter((match) => match.stage === "group");
  const finals = state.matches.filter((match) => match.stage === "semifinal" || match.stage === "final");
  return (
    <div className="page-content page-content--wide">
      <PageIntro eyebrow="Fase de grupos" title="Grupos y finales" text="Los dos mejores de cada grupo avanzan a semifinales." />
      <div className="group-standings-grid">
        {(["A", "B"] as const).map((group) => {
          const matches = groupMatches.filter((match) => match.group === group);
          const ids = new Set(matches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
          return (
            <section key={group}>
              <SectionHeader eyebrow="Clasifican los primeros 2" title={`Grupo ${group}`} />
              <StandingsTable teams={state.teams.filter((team) => ids.has(team.id))} matches={matches} />
            </section>
          );
        })}
      </div>
      <section className="group-finals">
        <SectionHeader eyebrow="Etapa final" title="Semifinales y final" />
        <div className="card-list">
          {finals.map((match) => <MatchCard key={match.id} match={match} teams={state.teams} />)}
        </div>
      </section>
    </div>
  );
}

function BracketView() {
  const { state } = useTournament();
  const rounds = [...new Set(state.matches.map((match) => match.roundLabel))];
  return (
    <div className="page-content page-content--wide">
      <PageIntro eyebrow="Eliminación directa" title="Llaves del torneo" text="Cada ganador avanza automáticamente." />
      <div className="bracket">
        {rounds.map((round) => (
          <div className="bracket-round" key={round}>
            <div className="bracket-round__title"><span>{round}</span><strong>{state.matches.filter((match) => match.roundLabel === round).length}</strong></div>
            <div className="bracket-round__matches">
              {state.matches.filter((match) => match.roundLabel === round).map((match) => {
                const home = state.teams.find((team) => team.id === match.homeTeamId);
                const away = state.teams.find((team) => team.id === match.awayTeamId);
                return (
                  <article className="bracket-match" key={match.id}>
                    <div className={match.winnerTeamId === home?.id ? "winner" : ""}>
                      <TeamMark team={home} compact /><span>{home?.name ?? "A definir"}</span><strong>{match.homeScore ?? "–"}</strong>
                    </div>
                    <div className={match.winnerTeamId === away?.id ? "winner" : ""}>
                      <TeamMark team={away} compact /><span>{away?.name ?? "A definir"}</span><strong>{match.awayScore ?? "–"}</strong>
                    </div>
                    <small>{match.status === "bye" ? "Pase libre" : `${formatTime(match.scheduledAt)} · ${match.field}`}</small>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamsView() {
  const { state } = useTournament();
  const standings = calculateStandings(state.teams, state.matches);
  return (
    <div className="page-content">
      <PageIntro eyebrow="Los protagonistas" title="Equipos" text={`${state.teams.length} equipos van por la copa.`} />
      <div className="teams-grid">
        {state.teams.map((team) => {
          const stats = standings.find((item) => item.team.id === team.id);
          return (
            <article className="team-card" key={team.id}>
              <TeamMark team={team} />
              <div>
                <h3>{team.name}</h3>
                <span>{team.shortName}</span>
              </div>
              <div className="team-card__stats">
                <span><strong>{stats?.played ?? 0}</strong> PJ</span>
                <span><strong>{stats?.won ?? 0}</strong> PG</span>
                <span><strong>{stats?.goalsFor ?? 0}</strong> GF</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <header className="page-intro">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </header>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>;
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function MyTeamCard() {
  const { state, selectedTeamId, selectMyTeam } = useTournament();
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const selected = state.teams.find((team) => team.id === selectedTeamId);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const enableNotifications = async () => {
    if (!selected) {
      setMessage("Primero elegí tu equipo.");
      return;
    }
    try {
      await enableTeamNotifications(state.id, selected.id);
      setNotificationStatus("granted");
      setMessage("Avisos activados para tu equipo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos activar los avisos.");
    }
  };

  return (
    <section className="my-team-card">
      <div className="my-team-card__intro">
        {selected ? <TeamMark team={selected} /> : <span className="my-team-card__icon"><BellRing /></span>}
        <div>
          <span className="eyebrow">Tu experiencia</span>
          <h2>{selected ? `Sos de ${selected.name}` : "¿De qué equipo sos?"}</h2>
          <p>Lo guardamos anónimamente en este dispositivo para avisarte cuándo jugar.</p>
        </div>
      </div>
      <div className="my-team-card__actions">
        <select value={selectedTeamId ?? ""} onChange={(event) => selectMyTeam(event.target.value || null)}>
          <option value="">Elegir mi equipo</option>
          {state.teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}
        </select>
        <button className="secondary-button" onClick={enableNotifications} disabled={!notificationsSupported()}>
          <Bell size={15} /> {notificationStatus === "granted" ? "Avisos activados" : "Activar avisos"}
        </button>
        {installPrompt ? (
          <button className="secondary-button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }}>
            <Download size={15} /> Instalar app
          </button>
        ) : null}
      </div>
      {message ? <span className="my-team-card__message">{message}</span> : null}
    </section>
  );
}

function AdminView() {
  const tournament = useTournament();
  const { state } = tournament;
  const [authenticated, setAuthenticated] = useState(
    !tournament.supabaseEnabled && sessionStorage.getItem("or-admin") === "yes",
  );
  const [authChecking, setAuthChecking] = useState(tournament.supabaseEnabled);
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [section, setSection] = useState<"tournaments" | "config" | "teams" | "results">("tournaments");
  const [editing, setEditing] = useState<Match | null>(null);

  useEffect(() => {
    if (!tournament.supabaseEnabled) return;
    hasAdminSession()
      .then(setAuthenticated)
      .finally(() => setAuthChecking(false));
  }, [tournament.supabaseEnabled]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    if (tournament.supabaseEnabled) {
      try {
        await signInAdmin(email, password);
        setAuthenticated(true);
        await tournament.refreshTournaments();
      } catch {
        setLoginError("No pudimos ingresar. Revisá el email y la contraseña.");
      }
      return;
    }
    const adminPin = import.meta.env.VITE_ADMIN_PIN || "1313";
    if (pin === adminPin) {
      sessionStorage.setItem("or-admin", "yes");
      setAuthenticated(true);
    } else {
      setLoginError("PIN incorrecto.");
    }
  };

  if (authChecking) {
    return <div className="login-shell"><div className="login-card"><Logo /><p>Verificando acceso...</p></div></div>;
  }

  if (!authenticated) {
    return (
      <div className="login-shell">
        <form className="login-card" onSubmit={login}>
          <Logo />
          <span className="eyebrow">Acceso privado</span>
          <h1>Panel administrador</h1>
          <p>{tournament.supabaseEnabled ? "Ingresá con tu usuario administrador." : "Ingresá tu PIN para gestionar el torneo."}</p>
          {tournament.supabaseEnabled ? (
            <>
              <Field label="Email"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@orhanoar.com" autoFocus /></Field>
              <Field label="Contraseña"><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" /></Field>
            </>
          ) : (
            <label className="field">
              <span>PIN de acceso</span>
              <div className="input-with-icon"><KeyRound size={18} /><input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" placeholder="••••" autoFocus /></div>
            </label>
          )}
          {loginError ? <span className="login-error">{loginError}</span> : null}
          <button className="primary-button" type="submit"><LockKeyhole size={18} /> Entrar al panel</button>
          {!tournament.supabaseEnabled ? <small>PIN inicial de esta demo: 1313</small> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div><span className="eyebrow">Control central</span><h1>Panel admin</h1></div>
        <div className={`sync-status ${tournament.synced ? "sync-status--ok" : ""}`}>
          {tournament.supabaseEnabled ? tournament.synced ? <Cloud size={15} /> : <CloudOff size={15} /> : <CloudOff size={15} />}
          {tournament.supabaseEnabled ? tournament.synced ? "Sincronizado" : "Guardando..." : "Guardado local"}
        </div>
      </header>
      <div className="active-admin-tournament">
        <span>Editando</span>
        <strong>{state.settings.title}</strong>
        <small>{formatLabel(state.settings.format)} · {state.teams.length} equipos</small>
      </div>
      <div className="admin-tabs">
        <button className={section === "tournaments" ? "active" : ""} onClick={() => setSection("tournaments")}><Trophy size={16} /> Torneos</button>
        <button className={section === "config" ? "active" : ""} onClick={() => setSection("config")}><Settings size={16} /> Torneo</button>
        <button className={section === "teams" ? "active" : ""} onClick={() => setSection("teams")}><Users size={16} /> Equipos</button>
        <button className={section === "results" ? "active" : ""} onClick={() => setSection("results")}><ListFilter size={16} /> Resultados</button>
      </div>
      {section === "tournaments" ? <TournamentsAdmin onManage={() => setSection("config")} /> : null}
      {section === "config" ? <TournamentAdmin /> : null}
      {section === "teams" ? <TeamsAdmin /> : null}
      {section === "results" ? <ResultsAdmin onEdit={setEditing} /> : null}
      {editing ? <ResultModal match={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function TournamentsAdmin({ onManage }: { onManage: () => void }) {
  const {
    tournaments,
    activeTournamentId,
    createTournament,
    deleteTournament,
    regenerateAssociationCode,
    selectTournament,
  } = useTournament();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("league");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    createTournament(title, format);
    setTitle("");
    onManage();
  };
  return (
    <div className="admin-content">
      <section className="admin-card">
        <SectionHeader eyebrow={`${tournaments.length} en simultáneo`} title="Todos los torneos" />
        <div className="tournament-admin-grid">
          {tournaments.map((tournament) => (
            <article
              className={`tournament-admin-card ${tournament.id === activeTournamentId ? "active" : ""}`}
              key={tournament.id}
            >
              <div className="tournament-admin-card__top">
                <span className={tournament.settings.published ? "publish-dot active" : "publish-dot"} />
                <span>{tournament.settings.published ? "Publicado" : "Oculto"}</span>
                {tournament.id === activeTournamentId ? <strong>Editando ahora</strong> : null}
              </div>
              <h3>{tournament.settings.title}</h3>
              <p>{tournament.settings.subtitle}</p>
              <div className="tournament-admin-card__stats">
                <span><Shield size={14} /> {tournament.teams.length} equipos</span>
                <span><Swords size={14} /> {tournament.matches.length} partidos</span>
                <span><CalendarDays size={14} /> {formatDate(`${tournament.settings.eventDate}T12:00:00`)}</span>
              </div>
              <div className="association-code-admin">
                <span>Código de asociación</span>
                <strong>{tournament.associationCode}</strong>
                <button
                  className="icon-button"
                  onClick={() => navigator.clipboard.writeText(tournament.associationCode)}
                  aria-label={`Copiar código ${tournament.associationCode}`}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="code-regenerate"
                  onClick={() =>
                    confirm("El código anterior dejará de funcionar para nuevos ingresos. ¿Regenerar?") &&
                    regenerateAssociationCode(tournament.id)
                  }
                >
                  Regenerar
                </button>
              </div>
              <div className="tournament-admin-card__actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    selectTournament(tournament.id);
                    onManage();
                  }}
                >
                  <Pencil size={15} /> Gestionar
                </button>
                <button
                  className="icon-button icon-button--danger"
                  disabled={tournaments.length <= 1}
                  onClick={() =>
                    confirm(`¿Eliminar "${tournament.settings.title}" y todos sus resultados?`) &&
                    deleteTournament(tournament.id)
                  }
                  aria-label={`Eliminar ${tournament.settings.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="admin-card create-tournament-card">
        <div>
          <span className="eyebrow">Nueva competencia</span>
          <h2>Crear otro torneo</h2>
          <p>Va a tener sus propios equipos, fixture y resultados.</p>
        </div>
        <form onSubmit={submit}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Copa Secundaria" />
          <select value={format} onChange={(event) => setFormat(event.target.value as TournamentFormat)}>
            <option value="league">Liga</option>
            <option value="knockout">Eliminación directa</option>
            <option value="groups">Grupos + semifinales + final</option>
          </select>
          <button className="primary-button" type="submit"><Plus size={17} /> Crear torneo</button>
        </form>
      </section>
    </div>
  );
}

function TournamentAdmin() {
  const { state, updateSettings, generateFixture, resetDemo } = useTournament();
  const settings = state.settings;
  const change = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => updateSettings({ [key]: value });
  const regenerate = () => {
    if (state.teams.length < 2) return alert("Necesitás al menos dos equipos.");
    if (settings.format === "groups" && state.teams.length < 4) return alert("La modalidad de grupos necesita al menos cuatro equipos.");
    if (confirm("Esto reemplaza el fixture y borra los resultados actuales. ¿Continuar?")) generateFixture();
  };
  return (
    <div className="admin-content">
      <section className="admin-card">
        <SectionHeader eyebrow="Formato" title="Tipo de competencia" />
        <div className="format-picker">
          <button className={settings.format === "league" ? "active" : ""} onClick={() => change("format", "league")}>
            <ListFilter /><strong>Liga</strong><span>Todos contra todos</span>
          </button>
          <button className={settings.format === "knockout" ? "active" : ""} onClick={() => change("format", "knockout")}>
            <Swords /><strong>Eliminatorias</strong><span>Llaves y final</span>
          </button>
          <button className={settings.format === "groups" ? "active" : ""} onClick={() => change("format", "groups")}>
            <Users /><strong>Grupos + finales</strong><span>Dos grupos, semis y final</span>
          </button>
        </div>
      </section>
      <section className="admin-card">
        <SectionHeader eyebrow="Información pública" title="Datos del torneo" />
        <div className="form-grid">
          <Field label="Nombre del torneo"><input value={settings.title} onChange={(e) => change("title", e.target.value)} /></Field>
          <Field label="Bajada"><input value={settings.subtitle} onChange={(e) => change("subtitle", e.target.value)} /></Field>
          <Field label="Fecha"><input type="date" value={settings.eventDate} onChange={(e) => change("eventDate", e.target.value)} /></Field>
          <Field label="Hora de inicio"><input type="time" value={settings.startTime} onChange={(e) => change("startTime", e.target.value)} /></Field>
          <Field label="Duración por partido"><input type="number" min="5" value={settings.matchMinutes} onChange={(e) => change("matchMinutes", Number(e.target.value))} /></Field>
          <Field label="Sede"><input value={settings.venue} onChange={(e) => change("venue", e.target.value)} /></Field>
          <Field label="Canchas, separadas por coma" wide>
            <input value={settings.fields.join(", ")} onChange={(e) => change("fields", e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
          </Field>
        </div>
        <label className="publish-toggle">
          <span className={settings.published ? "toggle active" : "toggle"} onClick={() => change("published", !settings.published)}><span /></span>
          <span><strong>{settings.published ? "Fixture publicado" : "Fixture oculto"}</strong><small>Controla la visibilidad pública del torneo.</small></span>
          {settings.published ? <Eye size={20} /> : <EyeOff size={20} />}
        </label>
      </section>
      <section className="admin-card admin-card--action">
        <div><span className="eyebrow">Listo para jugar</span><h2>Generar calendario completo</h2><p>Usa los {state.teams.length} equipos, horarios y canchas configuradas.</p></div>
        <button className="primary-button" onClick={regenerate}><Sparkles size={18} /> Generar fixture</button>
      </section>
      <button className="danger-link" onClick={() => confirm("¿Restaurar los datos de ejemplo?") && resetDemo()}><RefreshCcw size={15} /> Restaurar demo</button>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? "field--wide" : ""}`}><span>{label}</span>{children}</label>;
}

function TeamsAdmin() {
  const { state, addTeam, removeTeam } = useTournament();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState("#00aeea");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    addTeam(name, shortName, color);
    setName("");
    setShortName("");
  };
  return (
    <div className="admin-content">
      <section className="admin-card">
        <SectionHeader eyebrow={`${state.teams.length} cargados`} title="Equipos participantes" />
        <form className="add-team-form" onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del equipo" />
          <input value={shortName} maxLength={3} onChange={(e) => setShortName(e.target.value)} placeholder="SIG" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color del equipo" />
          <button className="primary-button" type="submit"><Plus size={17} /> Agregar</button>
        </form>
        <div className="admin-team-list">
          {state.teams.map((team) => (
            <div className="admin-team" key={team.id}>
              <TeamMark team={team} compact />
              <div><strong>{team.name}</strong><span>{team.shortName}</span></div>
              <button className="icon-button icon-button--danger" onClick={() => confirm(`¿Eliminar a ${team.name}?`) && removeTeam(team.id)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <p className="helper-text">Después de cambiar equipos, generá nuevamente el fixture desde la pestaña Torneo.</p>
      </section>
    </div>
  );
}

function ResultsAdmin({ onEdit }: { onEdit: (match: Match) => void }) {
  const { state, callPlayers, startMatch, finishMatch } = useTournament();
  const rounds = [...new Set(state.matches.map((match) => match.roundLabel))];
  const cannotDraw = (match: Match) =>
    state.settings.format === "knockout" || match.stage === "semifinal" || match.stage === "final";
  return (
    <div className="admin-content">
      {rounds.map((round) => (
        <section key={round} className="admin-round">
          <SectionHeader eyebrow={`${state.matches.filter((match) => match.roundLabel === round).length} partidos`} title={round} />
          <div className="card-list">
            {state.matches.filter((match) => match.roundLabel === round).map((match) => (
              <div className="admin-live-match" key={match.id}>
                <MatchCard match={match} teams={state.teams} onEdit={onEdit} />
                {match.homeTeamId && match.awayTeamId && match.status !== "completed" && match.status !== "bye" ? (
                  <div className="match-control-row">
                    <button className="secondary-button" onClick={() => callPlayers(match.id)}>
                      <BellRing size={15} /> {match.calledAt ? "Volver a llamar" : "Llamar jugadores"}
                    </button>
                    {match.status === "scheduled" ? (
                      <button className="primary-button" onClick={() => startMatch(match.id)}>
                        <Play size={15} /> Iniciar partido
                      </button>
                    ) : null}
                    {match.status === "live" ? (
                      <>
                        <button className="secondary-button" onClick={() => onEdit(match)}><Pencil size={15} /> Marcador</button>
                        <button
                          className="finish-button"
                          onClick={() => {
                            if (cannotDraw(match) && match.homeScore === match.awayScore) return alert("Este partido necesita un ganador.");
                            if (confirm("¿Finalizar el partido con este resultado?")) finishMatch(match.id);
                          }}
                        >
                          <Square size={14} /> Finalizar
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ResultModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const { state, updateResult, updateLiveScore, clearResult } = useTournament();
  const home = state.teams.find((team) => team.id === match.homeTeamId)!;
  const away = state.teams.find((team) => team.id === match.awayTeamId)!;
  const [homeScore, setHomeScore] = useState(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match.awayScore ?? 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cannotDraw = state.settings.format === "knockout" || match.stage === "semifinal" || match.stage === "final";
    if (match.status !== "live" && cannotDraw && homeScore === awayScore) return alert("Este partido tiene que tener un ganador.");
    if (match.status === "live") updateLiveScore(match.id, homeScore, awayScore);
    else updateResult(match.id, homeScore, awayScore);
    onClose();
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="result-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><X /></button>
        <span className="eyebrow">{match.roundLabel}</span>
        <h2>{match.status === "live" ? "Actualizar marcador" : "Cargar resultado"}</h2>
        <div className="score-editor">
          <div><TeamMark team={home} /><strong>{home.name}</strong><input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(Number(e.target.value))} /></div>
          <span>:</span>
          <div><TeamMark team={away} /><strong>{away.name}</strong><input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(Number(e.target.value))} /></div>
        </div>
        <button className="primary-button" type="submit"><Check size={18} /> {match.status === "live" ? "Actualizar en vivo" : "Guardar resultado"}</button>
        {match.status === "completed" ? <button type="button" className="danger-link" onClick={() => { clearResult(match.id); onClose(); }}>Borrar resultado</button> : null}
      </form>
    </div>
  );
}

function Header({ view, navigate }: { view: View; navigate: (view: View) => void }) {
  const { state } = useTournament();
  const [open, setOpen] = useState(false);
  const links: { id: View; label: string }[] = [
    { id: "inicio", label: "Inicio" },
    { id: "partidos", label: "Partidos" },
    { id: "competencia", label: state.settings.format === "league" ? "Posiciones" : state.settings.format === "groups" ? "Grupos" : "Llaves" },
    { id: "equipos", label: "Equipos" },
  ];
  return (
    <header className="site-header">
      <button className="header-brand" onClick={() => navigate("inicio")}><Logo small /><span><strong>{state.settings.title}</strong><small>Or Hanoar</small></span></button>
      <nav>
        {links.map((link) => <button key={link.id} className={view === link.id ? "active" : ""} onClick={() => navigate(link.id)}>{link.label}</button>)}
      </nav>
      <button className="admin-button" onClick={() => navigate("admin")}><CircleUserRound size={17} /> Admin</button>
      <button className="menu-button" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      {open ? <div className="mobile-menu">{[...links, { id: "admin" as View, label: "Panel admin" }].map((link) => <button key={link.id} onClick={() => { navigate(link.id); setOpen(false); }}>{link.label}</button>)}</div> : null}
    </header>
  );
}

function TournamentSwitcher() {
  const { visibleTournaments, activeTournamentId, selectTournament, removeAssociation } = useTournament();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="tournament-switcher">
        <div className="tournament-switcher__inner">
          <span><Trophy size={15} /> Mis torneos</span>
          <div>
            {visibleTournaments.map((tournament) => (
              <div className="associated-tournament-chip" key={tournament.id}>
                <button
                  className={tournament.id === activeTournamentId ? "active" : ""}
                  onClick={() => selectTournament(tournament.id)}
                >
                  {tournament.settings.title}
                  <small>{formatLabel(tournament.settings.format)}</small>
                </button>
                <button
                  className="association-remove"
                  onClick={() => confirm(`¿Quitar "${tournament.settings.title}" de este teléfono?`) && removeAssociation(tournament.id)}
                  aria-label={`Quitar ${tournament.settings.title}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button className="add-association-button" onClick={() => setAdding(true)}><Plus size={13} /> Agregar torneo</button>
          </div>
        </div>
      </div>
      {adding ? <AssociationModal onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function AssociationForm({ onSuccess }: { onSuccess?: () => void }) {
  const { associateTournament } = useTournament();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    const result = await associateTournament(code);
    setLoading(false);
    if (result === "success") {
      onSuccess?.();
      return;
    }
    setStatus(
      result === "already-added"
        ? "Este torneo ya está agregado."
        : result === "unpublished"
          ? "El torneo todavía no fue publicado."
          : "No encontramos un torneo publicado con ese código.",
    );
  };
  return (
    <form className="association-form" onSubmit={submit}>
      <label>
        <span>Código de asociación</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Ej: OR2026"
          maxLength={12}
          autoFocus
        />
      </label>
      {status ? <span className="association-error">{status}</span> : null}
      <button className="primary-button" type="submit" disabled={loading}>
        <Plus size={17} /> {loading ? "Buscando..." : "Agregar torneo"}
      </button>
    </form>
  );
}

function AssociationModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="association-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><X /></button>
        <Logo />
        <span className="eyebrow">Ingreso anónimo</span>
        <h2>Agregar torneo</h2>
        <p>Ingresá el código que compartió el organizador.</p>
        <AssociationForm onSuccess={onClose} />
      </div>
    </div>
  );
}

function AssociationAccessView({ navigate }: { navigate: (view: View) => void }) {
  return (
    <div className="association-access">
      <div className="association-access__card">
        <Logo />
        <span className="eyebrow">Fixture Or Hanoar</span>
        <h1>Seguí tu torneo</h1>
        <p>Tu ingreso es anónimo. Agregá el código del torneo para consultar partidos, resultados y posiciones.</p>
        <AssociationForm />
        <button className="admin-access-link" onClick={() => navigate("admin")}>
          <LockKeyhole size={14} /> Soy administrador
        </button>
      </div>
    </div>
  );
}

function BottomNav({ view, navigate }: { view: View; navigate: (view: View) => void }) {
  const { state } = useTournament();
  const items = useMemo(() => [
    { id: "inicio" as View, label: "Inicio", icon: Home },
    { id: "partidos" as View, label: "Partidos", icon: CalendarDays },
    { id: "competencia" as View, label: state.settings.format === "league" ? "Tabla" : state.settings.format === "groups" ? "Grupos" : "Llaves", icon: Trophy },
    { id: "equipos" as View, label: "Equipos", icon: Shield },
  ], [state.settings.format]);
  return (
    <nav className="bottom-nav">
      {items.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}
    </nav>
  );
}

export default function App() {
  const [view, setView] = useState<View>("inicio");
  const { state, hasPublicAccess } = useTournament();
  const navigate = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="app">
      <Header view={view} navigate={navigate} />
      {view !== "admin" && hasPublicAccess ? <TournamentSwitcher /> : null}
      <main>
        {view !== "admin" && !hasPublicAccess ? (
          <AssociationAccessView navigate={navigate} />
        ) : !state.settings.published && view !== "admin" ? (
          <div className="unpublished">
            <Logo /><span className="eyebrow">Volvemos pronto</span><h1>Estamos preparando el fixture</h1><p>El torneo todavía no fue publicado.</p>
          </div>
        ) : (
          <>
            {view === "inicio" ? <HomeView navigate={navigate} /> : null}
            {view === "partidos" ? <MatchesView /> : null}
            {view === "competencia" ? <CompetitionView /> : null}
            {view === "equipos" ? <TeamsView /> : null}
            {view === "admin" ? <AdminView /> : null}
          </>
        )}
      </main>
      {view !== "admin" && hasPublicAccess ? <BottomNav view={view} navigate={navigate} /> : null}
    </div>
  );
}
