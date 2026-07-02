import { useEffect, useState } from "react";

interface EspnTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  logo?: string;
}

interface EspnGame {
  id: string;
  date: string;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "suspended";
  homeTeam: EspnTeam;
  awayTeam: EspnTeam;
  homeScore: number | null;
  awayScore: number | null;
  hasStarted: boolean;
}

interface SportSection {
  sport: string;
  label: string;
  emoji: string;
  games: EspnGame[];
}

interface ScoresResponse {
  date: string;
  sports: SportSection[];
}

function formatGameTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}

function formatTodayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day!, 12));
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function GameStatus({ game }: { game: EspnGame }) {
  if (game.status === "in_progress") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-[11px] font-bold text-green-400 tracking-widest uppercase">
            Live
          </span>
        </div>
      </div>
    );
  }
  if (game.status === "final") {
    return (
      <span className="text-[11px] font-semibold text-muted-foreground/60 tracking-widest uppercase">
        Final
      </span>
    );
  }
  if (game.status === "postponed" || game.status === "suspended") {
    return (
      <span className="text-[11px] font-semibold text-muted-foreground/50 tracking-widest uppercase">
        {game.status === "postponed" ? "PPD" : "Susp"}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground/60">
      {formatGameTime(game.date)}
    </span>
  );
}

function TeamSide({
  team,
  score,
  hasStarted,
  align,
}: {
  team: EspnTeam;
  score: number | null;
  hasStarted: boolean;
  align: "left" | "right";
}) {
  const isLeft = align === "left";
  return (
    <div className={`flex items-center gap-2.5 flex-1 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
      {team.logo ? (
        <img
          src={team.logo}
          alt={team.abbreviation}
          className="h-8 w-8 object-contain flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted/20 flex-shrink-0" />
      )}
      <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
        <span className="text-sm font-semibold text-foreground leading-tight">
          {team.abbreviation}
        </span>
      </div>
      <span
        className={`text-xl font-bold tabular-nums ml-auto ${
          hasStarted ? "text-foreground" : "text-muted-foreground/30"
        }`}
        style={isLeft ? { marginLeft: "auto" } : { marginRight: "auto", marginLeft: 0 }}
      >
        {hasStarted && score !== null ? score : "—"}
      </span>
    </div>
  );
}

function GameCard({ game }: { game: EspnGame }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/20 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <TeamSide
        team={game.awayTeam}
        score={game.awayScore}
        hasStarted={game.hasStarted}
        align="left"
      />

      <div className="flex flex-col items-center gap-0.5 w-20 flex-shrink-0">
        <span className="text-muted-foreground/40 text-xs">@</span>
        <GameStatus game={game} />
      </div>

      <TeamSide
        team={game.homeTeam}
        score={game.homeScore}
        hasStarted={game.hasStarted}
        align="right"
      />
    </div>
  );
}

function SportSection({ section }: { section: SportSection }) {
  const sorted = [...section.games].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-base font-bold text-foreground">
          {section.emoji} {section.label}
        </span>
        <div className="flex-1 h-px bg-border/20" />
      </div>
      <div className="space-y-2">
        {sorted.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}

export default function Scores() {
  const [data, setData] = useState<ScoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch("/api/scores/today")
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<ScoresResponse>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#060810]">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(20,80,200,0.12),transparent)] pointer-events-none -z-10" />

      <div className="max-w-lg mx-auto px-4 pt-10 pb-24">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-bebas text-5xl tracking-wide text-foreground leading-none">
            Scores
          </h1>
          {data?.date && (
            <p className="text-sm text-muted-foreground mt-1">
              {formatTodayLabel(data.date)}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">
              Unable to load scores — try again later
            </p>
          </div>
        ) : !data || data.sports.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">
              No games today — check back later
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {data.sports.map((section) => (
              <SportSection key={section.sport} section={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
