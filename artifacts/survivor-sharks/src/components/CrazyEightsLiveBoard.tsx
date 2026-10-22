import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ChevronRight, Crosshair, LayoutGrid, Loader2 } from "lucide-react";
import type { GameSummary, GridPlayerRow, PlayerPick } from "@/components/nflConfidenceLiveTypes";
import {
  formatConfidenceGameStatusLabel,
  resolveNflConfidenceLivePickCell,
  type ConfidenceLiveCellState,
} from "@/lib/nflConfidenceLivePickCell";
import { computeCrazyEightsLivePeriodPoints } from "@/lib/crazyEightsLivePoints";
import { formatSecondsAgo } from "@/lib/nflPickEmLivePickCell";

const GAME_COL_MIN = 56;
const STICKY_PLAYER_W = 112;

type Accent = "nhl" | "nba" | "mlb";

const ACCENT: Record<
  Accent,
  {
    border: string;
    pulse: string;
    liveText: string;
    jumpBtn: string;
    rowMe: string;
    stickyBg: string;
    meRowBg: string;
    headerLine: string;
  }
> = {
  nhl: {
    border: "border-purple-500/25",
    pulse: "bg-purple-400",
    liveText: "text-purple-300",
    jumpBtn:
      "border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20",
    rowMe: "bg-purple-500/[0.08]",
    stickyBg: "bg-[#0c1014]",
    meRowBg: "bg-[#100e14]",
    headerLine: "via-purple-400/70",
  },
  nba: {
    border: "border-orange-500/25",
    pulse: "bg-orange-400",
    liveText: "text-orange-300",
    jumpBtn:
      "border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20",
    rowMe: "bg-orange-500/[0.08]",
    stickyBg: "bg-[#0c1014]",
    meRowBg: "bg-[#14100e]",
    headerLine: "via-orange-400/70",
  },
  mlb: {
    border: "border-purple-500/25",
    pulse: "bg-purple-400",
    liveText: "text-purple-300",
    jumpBtn:
      "border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20",
    rowMe: "bg-purple-500/[0.08]",
    stickyBg: "bg-[#0c1014]",
    meRowBg: "bg-[#100e14]",
    headerLine: "via-purple-400/70",
  },
};

interface GridResponse {
  date: string;
  dateLabel: string;
  games: GameSummary[];
  players: GridPlayerRow[];
}

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("Request failed");
    return r.json() as Promise<T>;
  });
}

function getTodayEt(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getCurrentNhlSat(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysBack = (dow + 1) % 7;
  return new Date(dt.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getCurrentNbaFri(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysBack = (dow - 5 + 7) % 7;
  return new Date(dt.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function ConfidencePickCell({
  state,
  abbr,
  points,
}: {
  state: ConfidenceLiveCellState;
  abbr: string | null;
  points: number | null;
}) {
  if (state === "hidden" || !abbr) {
    return <span className="text-white/15 text-xs font-mono">—</span>;
  }

  const styles: Record<Exclude<ConfidenceLiveCellState, "hidden">, string> = {
    correct: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
    incorrect: "border-red-400/45 bg-red-500/15 text-red-200 line-through opacity-70",
    live_winning:
      "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30",
    live_losing:
      "border-red-400/35 bg-red-500/10 text-red-300/90 ring-1 ring-red-400/20",
    pending: "border-white/15 bg-white/[0.04] text-white/80",
  };

  return (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center gap-0 min-w-[44px] rounded px-0.5 py-0.5 font-mono text-[9px] font-bold tracking-tight border leading-tight",
        styles[state],
      )}
    >
      <span>{abbr}</span>
      {points != null && <span className="text-[8px] opacity-90">{points}</span>}
    </span>
  );
}

function GameHeader({ game, accent }: { game: GameSummary; accent: Accent }) {
  const a = ACCENT[accent];
  const live = game.status === "in_progress";
  const final = game.status === "final";
  const score =
    game.awayScore != null && game.homeScore != null
      ? `${game.awayScore}–${game.homeScore}`
      : "—";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 py-1.5 px-0.5 min-w-[56px]",
        live && "relative",
      )}
    >
      {live && (
        <span
          className={cn(
            "absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
            a.headerLine,
          )}
        />
      )}
      <div className="text-[9px] font-semibold text-white/45 whitespace-nowrap leading-tight">
        <span>{game.awayTeam.abbreviation}</span>
        <span className="text-white/25 mx-0.5">@</span>
        <span>{game.homeTeam.abbreviation}</span>
      </div>
      <span
        className={cn(
          "font-mono text-[11px] font-bold tabular-nums leading-none",
          live ? a.liveText : final ? "text-white/90" : "text-white/35",
        )}
      >
        {score}
      </span>
      <span
        className={cn(
          "text-[8px] font-bold uppercase tracking-wider leading-none max-w-[56px] truncate",
          live ? "text-purple-400/90" : final ? "text-white/30" : "text-white/40",
        )}
      >
        {formatConfidenceGameStatusLabel(game)}
      </span>
    </div>
  );
}

export type CrazyEightsLiveBoardProps = {
  poolId: number;
  sport: string;
  sandboxMode?: boolean;
  periodStart?: string;
  usePeriodSelector?: boolean;
  currentUserId: number | null;
};

export function CrazyEightsLiveBoard({
  poolId,
  sport,
  poolType = "crazy_8s",
  sandboxMode = false,
  periodStart,
  usePeriodSelector = false,
  currentUserId,
}: CrazyEightsLiveBoardProps & { poolType?: string }) {
  const { user } = useAuth();
  const isNhl = sport === "nhl";
  const isNba = sport === "nba";
  const isWeekend = isNhl || isNba;
  const accent: Accent = isNba ? "nba" : isNhl ? "nhl" : "mlb";
  const a = ACCENT[accent];

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const [date, setDate] = useState(() => {
    if (usePeriodSelector) return "";
    if (!isWeekend) return getTodayEt();
    if (sandboxMode) return "";
    return isNba ? getCurrentNbaFri() : getCurrentNhlSat();
  });

  const gridUrl = usePeriodSelector
    ? `/api/pools/${poolId}/crazy-eights/grid${periodStart ? `?periodStart=${encodeURIComponent(periodStart)}` : ""}`
    : `/api/pools/${poolId}/crazy-eights/grid?date=${date}`;

  const {
    data: gridData,
    isLoading: gridLoading,
    dataUpdatedAt: gridUpdatedAt,
    isFetching: gridFetching,
  } = useQuery<GridResponse>({
    queryKey: usePeriodSelector
      ? ["crazy-eights-live-grid", poolId, periodStart ?? "current"]
      : ["crazy-eights-live-grid", poolId, date],
    queryFn: () => authedFetch<GridResponse>(gridUrl),
    enabled:
      !!user && (usePeriodSelector ? isWeekend : isWeekend ? true : !!date),
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.games.some((g) => g.status === "in_progress")
        ? 15_000
        : 60_000,
  });

  useEffect(() => {
    if (usePeriodSelector) return;
    if (date === "" && gridData?.date) setDate(gridData.date);
  }, [usePeriodSelector, date, gridData?.date]);

  const gamesById = useMemo(() => {
    return new Map((gridData?.games ?? []).map((g) => [g.id, g]));
  }, [gridData?.games]);

  const displayGames = useMemo(() => {
    const pickedIds = new Set(
      (gridData?.players ?? []).flatMap((p) => Object.keys(p.picks)),
    );
    const list = (gridData?.games ?? []).filter((g) => pickedIds.has(g.id));
    list.sort(
      (x, y) => new Date(x.startTime).getTime() - new Date(y.startTime).getTime(),
    );
    return list;
  }, [gridData?.games, gridData?.players]);

  const rows = useMemo(() => {
    const players = gridData?.players ?? [];
    const ranked = players
      .map((p) => ({
        userId: p.userId,
        name: p.displayName || p.username,
        picks: p.picks,
        periodPoints: computeCrazyEightsLivePeriodPoints(p.picks, gamesById, poolType ?? "crazy_8s"),
      }))
      .sort((x, y) => y.periodPoints - x.periodPoints);
    return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [gridData?.players, gamesById]);

  const liveCount = displayGames.filter((g) => g.status === "in_progress").length;
  const me = rows.find((r) => r.userId === currentUserId);
  const periodLabel = gridData?.dateLabel ?? (isWeekend ? "This weekend" : "Today");

  const jumpToMe = useCallback(() => {
    if (currentUserId == null) return;
    rowRefs.current.get(currentUserId)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [currentUserId]);

  if (gridLoading && !gridData) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-20 rounded-xl border bg-[#070a09] text-white/50",
          a.border,
        )}
      >
        <Loader2 className={cn("w-8 h-8 animate-spin", a.liveText)} />
        <p className="font-bebas text-lg tracking-wide">Loading live board…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide">No picks yet</p>
      </div>
    );
  }

  if (displayGames.length === 0) {
    return (
      <div
        className={cn(
          "text-center py-16 rounded-xl border bg-[#070a09] text-white/50",
          a.border,
        )}
      >
        <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-bebas text-xl tracking-wide">No picked games this period</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative -mx-3 sm:-mx-0 rounded-none sm:rounded-xl overflow-hidden border bg-[#070a09] text-white",
        a.border,
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5",
          "border-b border-white/10 bg-[#0a0e12]/95 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {liveCount > 0 ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
                  a.pulse,
                )}
              />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", a.pulse)} />
            </span>
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/25" />
          )}
          <span className={cn("font-bebas text-lg tracking-wide leading-none", a.liveText)}>
            Live
          </span>
          <span className="text-white/35 text-xs">·</span>
          <span className="font-bebas text-lg tracking-wide leading-none truncate max-w-[200px] sm:max-w-none">
            {periodLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50 ml-auto">
          {liveCount > 0 && (
            <>
              <span className="font-mono tabular-nums">{liveCount} live</span>
              <span className="text-white/25">·</span>
            </>
          )}
          <span className="font-mono tabular-nums">
            Updated {formatSecondsAgo(gridUpdatedAt)}
            {gridFetching ? " · …" : ""}
          </span>
        </div>
        {me && (
          <p className="w-full text-[10px] text-white/40 leading-snug">
            #{me.rank} · {me.periodPoints} pts this period
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-[#0c1014]/80">
        <p className="text-[10px] text-white/45">
          Confidence picks · scroll games{" "}
          <ChevronRight className="inline w-3 h-3 text-white/30" aria-hidden />
        </p>
        {currentUserId != null && (
          <button
            type="button"
            onClick={jumpToMe}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
              a.jumpBtn,
            )}
          >
            <Crosshair className="w-3 h-3" />
            Jump to me
          </button>
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto overflow-y-visible [scrollbar-width:thin]">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: STICKY_PLAYER_W + displayGames.length * GAME_COL_MIN + 56 }}
        >
          <thead className={cn("z-20", a.stickyBg)}>
            <tr className="border-b border-white/[0.08]">
              <th
                className={cn("sticky left-0 z-30 text-left align-bottom pb-1 pl-2 pr-1", a.stickyBg)}
                style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Player
                </span>
              </th>
              {displayGames.map((game) => (
                <th key={game.id} className="align-bottom font-normal">
                  <GameHeader game={game} accent={accent} />
                </th>
              ))}
              <th
                className={cn(
                  "sticky right-0 z-30 text-right align-bottom pb-1 pl-1 pr-2",
                  a.stickyBg,
                )}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Pts
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isMe = row.userId === currentUserId;
              return (
                <tr
                  key={row.userId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.userId, el);
                  }}
                  className={cn(
                    "border-b border-white/[0.05]",
                    isMe ? a.rowMe : idx % 2 === 1 ? "bg-white/[0.02]" : "",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 py-2 pl-2 pr-1 align-middle",
                      a.stickyBg,
                      isMe && a.meRowBg,
                    )}
                    style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
                  >
                    <div className="flex items-baseline gap-1 min-w-0">
                      <span
                        className={cn(
                          "font-mono text-[10px] font-bold tabular-nums shrink-0 w-4",
                          row.rank === 1
                            ? "text-amber-300"
                            : row.rank <= 3
                              ? "text-white/50"
                              : "text-white/30",
                        )}
                      >
                        {row.rank}
                      </span>
                      <span
                        className={cn(
                          "font-bebas text-sm tracking-wide truncate leading-none",
                          isMe ? a.liveText : "text-white/90",
                        )}
                      >
                        {row.name}
                      </span>
                    </div>
                  </td>
                  {displayGames.map((game) => {
                    const pick = row.picks[game.id] as PlayerPick | undefined;
                    const { state, abbr, points } = resolveNflConfidenceLivePickCell(
                      pick,
                      game,
                    );
                    return (
                      <td key={game.id} className="py-1.5 px-0.5 text-center align-middle">
                        <ConfidencePickCell state={state} abbr={abbr} points={points} />
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "sticky right-0 z-10 py-2 pl-1 pr-2 text-right align-middle",
                      a.stickyBg,
                      isMe && a.meRowBg,
                    )}
                  >
                    <span className="font-mono text-sm font-bold tabular-nums text-white/90">
                      {row.periodPoints}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
