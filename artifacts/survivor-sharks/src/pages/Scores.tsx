import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface GameDetail {
  gameId: string;
  headline: string | null;
  venue: string | null;
  broadcasts: string[];
  linescore: {
    columns: string[];
    home: (number | null)[];
    away: (number | null)[];
    homeLabel: string;
    awayLabel: string;
  } | null;
  situation: {
    balls: number;
    strikes: number;
    outs: number;
    onFirst: boolean;
    onSecond: boolean;
    onThird: boolean;
    batter: string | null;
    pitcher: string | null;
    lastPlay: string | null;
  } | null;
  scoringSummary: Array<{ period: string; description: string }>;
  homePitcher: { name: string; era: string; record: string } | null;
  awayPitcher: { name: string; era: string; record: string } | null;
  odds: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGameTime(isoDate: string): string {
  return (
    new Date(isoDate).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " ET"
  );
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

// ── Base Diamond SVG ──────────────────────────────────────────────────────────

function BaseDiamond({
  onFirst,
  onSecond,
  onThird,
}: {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
}) {
  const base = (cx: number, cy: number, filled: boolean) => (
    <rect
      x={cx - 7}
      y={cy - 7}
      width={14}
      height={14}
      fill={filled ? "hsl(var(--primary))" : "transparent"}
      stroke={filled ? "hsl(var(--primary))" : "rgba(255,255,255,0.25)"}
      strokeWidth={1.5}
      transform={`rotate(45 ${cx} ${cy})`}
    />
  );
  return (
    <svg width={60} height={52} className="flex-shrink-0">
      {base(30, 8, onSecond)}
      {base(50, 26, onFirst)}
      {base(10, 26, onThird)}
      <rect
        x={23}
        y={37}
        width={14}
        height={9}
        fill="transparent"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1.5}
        rx={1}
      />
    </svg>
  );
}

// ── GameStatus ────────────────────────────────────────────────────────────────

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

// ── TeamSide ──────────────────────────────────────────────────────────────────

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
    <div
      className={`flex items-center gap-2.5 flex-1 ${isLeft ? "flex-row" : "flex-row-reverse"}`}
    >
      {team.logo ? (
        <img
          src={team.logo}
          alt={team.abbreviation}
          className="h-8 w-8 object-contain flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted/20 flex-shrink-0" />
      )}
      <div
        className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}
      >
        <span className="text-sm font-semibold text-foreground leading-tight">
          {team.abbreviation}
        </span>
      </div>
      <span
        className={`text-xl font-bold tabular-nums ml-auto ${
          hasStarted ? "text-foreground" : "text-muted-foreground/30"
        }`}
        style={
          isLeft
            ? { marginLeft: "auto" }
            : { marginRight: "auto", marginLeft: 0 }
        }
      >
        {hasStarted && score !== null ? score : "—"}
      </span>
    </div>
  );
}

// ── GameCard ──────────────────────────────────────────────────────────────────

function GameCard({
  game,
  onClick,
}: {
  game: EspnGame;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/20 bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer"
      onClick={onClick}
    >
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

// ── SportSectionCard ──────────────────────────────────────────────────────────

function SportSectionCard({
  section,
  onSelectGame,
}: {
  section: SportSection;
  onSelectGame: (game: EspnGame, sport: string) => void;
}) {
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
          <GameCard
            key={game.id}
            game={game}
            onClick={() => onSelectGame(game, section.sport)}
          />
        ))}
      </div>
    </div>
  );
}

// ── GameDetailSheet ───────────────────────────────────────────────────────────

function GameDetailSheet({
  selectedGame,
  onClose,
}: {
  selectedGame: { game: EspnGame; sport: string } | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!selectedGame) return;
    setDetail(null);
    setDetailLoading(true);
    setIsPolling(false);

    const doFetch = () =>
      fetch(
        `/api/scores/game/${selectedGame.game.id}?sport=${selectedGame.sport}`,
      )
        .then((r) => (r.ok ? (r.json() as Promise<GameDetail>) : null))
        .then((d) => {
          setDetail(d);
          setDetailLoading(false);
        })
        .catch(() => setDetailLoading(false));

    doFetch();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (selectedGame.game.status === "in_progress") {
      setIsPolling(true);
      interval = setInterval(doFetch, 45_000);
    }

    return () => {
      if (interval !== undefined) clearInterval(interval);
      setIsPolling(false);
    };
  }, [selectedGame?.game.id, selectedGame?.sport]);

  const game = selectedGame?.game;

  const RHE_COLS = new Set(["R", "H", "E"]);

  return (
    <Sheet
      open={selectedGame !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto p-0 flex flex-col"
      >
        {game && (
          <>
            {/* ── Header ── */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30">
              <SheetTitle className="sr-only">
                {game.awayTeam.displayName} at {game.homeTeam.displayName}
              </SheetTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  {game.awayTeam.logo && (
                    <img
                      src={game.awayTeam.logo}
                      alt={game.awayTeam.abbreviation}
                      className="h-9 w-9 object-contain"
                    />
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground">Away</div>
                    <div className="font-semibold text-sm leading-tight">
                      {game.awayTeam.abbreviation}
                    </div>
                  </div>
                  <span className="font-bebas text-4xl ml-auto tabular-nums">
                    {game.hasStarted && game.awayScore !== null
                      ? game.awayScore
                      : "—"}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
                  <GameStatus game={game} />
                  {isPolling && (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>

                <div className="flex items-center gap-2 flex-1 flex-row-reverse">
                  {game.homeTeam.logo && (
                    <img
                      src={game.homeTeam.logo}
                      alt={game.homeTeam.abbreviation}
                      className="h-9 w-9 object-contain"
                    />
                  )}
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Home</div>
                    <div className="font-semibold text-sm leading-tight">
                      {game.homeTeam.abbreviation}
                    </div>
                  </div>
                  <span className="font-bebas text-4xl mr-auto tabular-nums">
                    {game.hasStarted && game.homeScore !== null
                      ? game.homeScore
                      : "—"}
                  </span>
                </div>
              </div>
            </SheetHeader>

            {/* ── Detail body ── */}
            <div className="flex-1 px-6 py-6 space-y-6 overflow-y-auto">
              {detailLoading && (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
                </div>
              )}

              {detail && (
                <>
                  {/* Headline */}
                  {detail.headline && (
                    <p className="text-sm text-muted-foreground italic leading-relaxed">
                      {detail.headline}
                    </p>
                  )}

                  {/* Linescore */}
                  {detail.linescore && (
                    <div>
                      <h4 className="font-bebas text-xl tracking-wide mb-2">
                        Line Score
                      </h4>
                      <div className="overflow-x-auto rounded-lg border border-border/30">
                        <table className="w-full text-xs font-mono border-collapse">
                          <thead>
                            <tr className="bg-muted/10">
                              <th className="text-left px-3 py-2 text-muted-foreground min-w-[44px]" />
                              {detail.linescore.columns.map((col, i) => (
                                <th
                                  key={i}
                                  className={cn(
                                    "px-1.5 py-2 text-center min-w-[22px]",
                                    RHE_COLS.has(col)
                                      ? "text-primary font-bold border-l border-border/30"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              [
                                {
                                  label: detail.linescore.awayLabel,
                                  vals: detail.linescore.away,
                                },
                                {
                                  label: detail.linescore.homeLabel,
                                  vals: detail.linescore.home,
                                },
                              ] as const
                            ).map(({ label, vals }) => (
                              <tr
                                key={label}
                                className="border-t border-border/20"
                              >
                                <td className="px-3 py-2 font-bold text-foreground">
                                  {label}
                                </td>
                                {vals.map((val, i) => (
                                  <td
                                    key={i}
                                    className={cn(
                                      "px-1.5 py-2 text-center tabular-nums",
                                      RHE_COLS.has(
                                        detail.linescore!.columns[i] ?? "",
                                      )
                                        ? "font-bold text-foreground border-l border-border/30"
                                        : "text-muted-foreground/80",
                                    )}
                                  >
                                    {val === null ? "—" : val}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Live situation */}
                  {detail.situation && (
                    <div>
                      <h4 className="font-bebas text-xl tracking-wide mb-3">
                        Live Situation
                      </h4>
                      <div className="flex items-start gap-4">
                        <BaseDiamond
                          onFirst={detail.situation.onFirst}
                          onSecond={detail.situation.onSecond}
                          onThird={detail.situation.onThird}
                        />
                        <div className="space-y-2 flex-1 pt-1">
                          {/* Balls / Strikes / Outs */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    "w-3 h-3 rounded-full border",
                                    i < detail.situation!.balls
                                      ? "bg-green-400 border-green-400"
                                      : "border-border/50",
                                  )}
                                />
                              ))}
                              <span className="text-[11px] text-muted-foreground ml-0.5">
                                B
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    "w-3 h-3 rounded-full border",
                                    i < detail.situation!.strikes
                                      ? "bg-yellow-400 border-yellow-400"
                                      : "border-border/50",
                                  )}
                                />
                              ))}
                              <span className="text-[11px] text-muted-foreground ml-0.5">
                                S
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    "w-3 h-3 rounded-full border",
                                    i < detail.situation!.outs
                                      ? "bg-red-400 border-red-400"
                                      : "border-border/50",
                                  )}
                                />
                              ))}
                              <span className="text-[11px] text-muted-foreground ml-0.5">
                                O
                              </span>
                            </div>
                          </div>
                          {detail.situation.batter && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">
                                Batting:{" "}
                              </span>
                              {detail.situation.batter}
                            </p>
                          )}
                          {detail.situation.pitcher && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">
                                Pitching:{" "}
                              </span>
                              {detail.situation.pitcher}
                            </p>
                          )}
                        </div>
                      </div>
                      {detail.situation.lastPlay && (
                        <p className="mt-3 text-sm text-muted-foreground/80 italic border-l-2 border-primary/40 pl-3 leading-relaxed">
                          {detail.situation.lastPlay}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Scoring summary */}
                  {detail.scoringSummary.length > 0 && (
                    <div>
                      <h4 className="font-bebas text-xl tracking-wide mb-2">
                        Scoring Summary
                      </h4>
                      <div className="space-y-2.5">
                        {detail.scoringSummary.map((s, i) => (
                          <div key={i} className="flex gap-3 text-sm">
                            <span className="text-muted-foreground font-mono text-xs min-w-[32px] pt-0.5 flex-shrink-0">
                              {s.period}
                            </span>
                            <span className="text-foreground/80 leading-snug">
                              {s.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Starting pitchers (MLB) */}
                  {(detail.awayPitcher || detail.homePitcher) && (
                    <div>
                      <h4 className="font-bebas text-xl tracking-wide mb-2">
                        Starting Pitchers
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {
                            side: game.awayTeam.abbreviation,
                            pitcher: detail.awayPitcher,
                          },
                          {
                            side: game.homeTeam.abbreviation,
                            pitcher: detail.homePitcher,
                          },
                        ].map(
                          ({ side, pitcher }) =>
                            pitcher && (
                              <div
                                key={side}
                                className="rounded-lg border border-border/30 bg-card/40 p-3 space-y-0.5"
                              >
                                <div className="text-xs text-muted-foreground">
                                  {side}
                                </div>
                                <div className="text-sm font-semibold leading-tight">
                                  {pitcher.name}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {pitcher.era} ERA · {pitcher.record}
                                </div>
                              </div>
                            ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Misc: broadcasts, venue, odds */}
                  {(detail.broadcasts.length > 0 ||
                    detail.venue ||
                    detail.odds) && (
                    <div className="space-y-1.5 rounded-lg border border-border/20 bg-card/30 p-4">
                      {detail.broadcasts.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            Watch:{" "}
                          </span>
                          {detail.broadcasts.join(" · ")}
                        </p>
                      )}
                      {detail.venue && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            Venue:{" "}
                          </span>
                          {detail.venue}
                        </p>
                      )}
                      {detail.odds && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            Odds:{" "}
                          </span>
                          {detail.odds}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Scores page ───────────────────────────────────────────────────────────────

export default function Scores() {
  const [data, setData] = useState<ScoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedGame, setSelectedGame] = useState<{
    game: EspnGame;
    sport: string;
  } | null>(null);

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
    <div
      style={{
        backgroundImage: "url('/shark-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
        minHeight: "100vh",
      }}
    >
      <div style={{ backgroundColor: "rgba(0, 0, 0, 0.72)", minHeight: "100vh" }}>
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(20,80,200,0.12),transparent)] pointer-events-none -z-10" />

        <div className="max-w-5xl mx-auto px-4 pt-10 pb-24">
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
            <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:gap-6">
              {data.sports.map((section) => (
                <div
                  key={section.sport}
                  className={section.games.length > 6 ? "md:col-span-2" : ""}
                >
                  <SportSectionCard
                    section={section}
                    onSelectGame={(game, sport) =>
                      setSelectedGame({ game, sport })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <GameDetailSheet
        selectedGame={selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
}
