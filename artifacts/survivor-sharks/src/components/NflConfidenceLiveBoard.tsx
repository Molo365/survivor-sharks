import { useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ChevronRight, Crosshair, LayoutGrid, Loader2 } from "lucide-react";
import {
  formatConfidenceGameStatusLabel,
  resolveNflConfidenceLivePickCell,
  type ConfidenceLiveCellState,
} from "@/lib/nflConfidenceLivePickCell";
import { formatSecondsAgo } from "@/lib/nflPickEmLivePickCell";
import type {
  ConfidenceGridResponse,
  ConfidenceLeaderboardResponse,
  GameSummary,
  PlayerPick,
} from "@/components/nflConfidenceLiveTypes";
import type { TiebreakerMatchupGame } from "@/components/TiebreakerGuessDialogUi";
import {
  TiebreakerStandingsColumnGuess,
  TiebreakerStandingsColumnHeader,
} from "@/components/TiebreakerStandingsColumn";

const GAME_COL_MIN = 56;
const STICKY_PLAYER_W = 112;
const STICKY_BG = "bg-[#0c1014]";

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

function GameHeader({ game }: { game: GameSummary }) {
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
        <span className="absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
      )}
      <div className="text-[9px] font-semibold text-white/45 whitespace-nowrap leading-tight">
        <span>{game.awayTeam.abbreviation}</span>
        <span className="text-white/25 mx-0.5">@</span>
        <span>{game.homeTeam.abbreviation}</span>
      </div>
      <span
        className={cn(
          "font-mono text-[11px] font-bold tabular-nums leading-none",
          live ? "text-violet-300" : final ? "text-white/90" : "text-white/35",
        )}
      >
        {score}
      </span>
      <span
        className={cn(
          "text-[8px] font-bold uppercase tracking-wider leading-none max-w-[56px] truncate",
          live ? "text-violet-400/90" : final ? "text-white/30" : "text-white/40",
        )}
      >
        {formatConfidenceGameStatusLabel(game)}
      </span>
    </div>
  );
}

export type NflConfidenceLiveBoardProps = {
  poolId: number;
  week: number;
  variant: "season" | "weekly";
  currentUserId: number | null;
};

export function NflConfidenceLiveBoard({
  poolId,
  week,
  variant,
  currentUserId,
}: NflConfidenceLiveBoardProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const currentYear = new Date().getFullYear();

  const apiBase =
    variant === "weekly" ? "nfl-confidence-weekly" : "nfl-confidence";

  const gridQueryKey = [`${apiBase}-live-grid`, poolId, week];
  const lbQueryKey = [`${apiBase}-live-leaderboard`, poolId, week];

  const {
    data: gridData,
    isLoading: gridLoading,
    dataUpdatedAt: gridUpdatedAt,
    isFetching: gridFetching,
  } = useQuery<ConfidenceGridResponse>({
    queryKey: gridQueryKey,
    queryFn: () =>
      authedFetch<ConfidenceGridResponse>(
        variant === "season"
          ? `/api/pools/${poolId}/nfl-confidence/grid?week=${week}&season=${currentYear}`
          : `/api/pools/${poolId}/nfl-confidence-weekly/grid?week=${week}&season=${currentYear}`,
      ),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.games.some((g) => g.status === "in_progress") ? 15_000 : 60_000,
  });

  const { data: lbData } = useQuery<ConfidenceLeaderboardResponse>({
    queryKey: lbQueryKey,
    queryFn: () =>
      authedFetch<ConfidenceLeaderboardResponse>(
        `/api/pools/${poolId}/${apiBase}/leaderboard?week=${week}`,
      ),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const games = gridData?.games ?? [];
      return games.some((g) => g.status === "in_progress") ? 15_000 : 60_000;
    },
  });

  const games = useMemo(() => {
    const list = [...(gridData?.games ?? [])];
    list.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    return list;
  }, [gridData?.games]);

  const weeklyTb = gridData?.weeklyTiebreaker;
  const weeklyTbColumnHeader = weeklyTb?.columnHeader;
  const showWeeklyTbCol = Boolean(weeklyTbColumnHeader);
  const weeklyTbMatchup = weeklyTb?.tiebreakerMatchup as TiebreakerMatchupGame | undefined;

  const playerPickMap = useMemo(() => {
    const m = new Map<
      number,
      {
        picks: Record<string, import("@/components/nflConfidenceLiveTypes").PlayerPick>;
        weeklyTiebreakerGuess: number | null;
      }
    >();
    for (const p of gridData?.players ?? []) {
      m.set(p.userId, {
        picks: p.picks,
        weeklyTiebreakerGuess: p.weeklyTiebreakerGuess ?? null,
      });
    }
    return m;
  }, [gridData?.players]);

  const rows = useMemo(() => {
    const lbPlayers = lbData?.players ?? [];
    if (lbPlayers.length > 0) {
      return lbPlayers.map((lb) => {
        const gridRow = playerPickMap.get(lb.userId);
        return {
          rank: lb.rank,
          userId: lb.userId,
          name: lb.displayName || lb.username,
          weekPoints: lb.weekPoints,
          seasonPoints: lb.seasonPoints,
          picks: gridRow?.picks ?? {},
          weeklyTiebreakerGuess: gridRow?.weeklyTiebreakerGuess ?? null,
        };
      });
    }
    return (gridData?.players ?? []).map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      name: p.displayName || p.username,
      weekPoints: 0,
      seasonPoints: undefined,
      picks: p.picks,
      weeklyTiebreakerGuess: p.weeklyTiebreakerGuess ?? null,
    }));
  }, [lbData?.players, gridData?.players, playerPickMap]);

  const liveCount = games.filter((g) => g.status === "in_progress").length;
  const me = rows.find((r) => r.userId === currentUserId);
  const accentBorder = variant === "weekly" ? "border-cyan-500/20" : "border-violet-500/20";
  const accentLive = variant === "weekly" ? "text-cyan-300" : "text-violet-300";

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
          "flex flex-col items-center justify-center gap-3 py-20 rounded-xl border",
          accentBorder,
          "bg-[#070a09] text-white/50",
        )}
      >
        <Loader2 className="w-8 h-8 animate-spin text-violet-400/80" />
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

  if (games.length === 0) {
    return (
      <div
        className={cn(
          "text-center py-16 rounded-xl border bg-[#070a09] text-white/50",
          accentBorder,
        )}
      >
        <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-bebas text-xl tracking-wide">No games this week</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative -mx-3 sm:-mx-0 rounded-none sm:rounded-xl overflow-hidden",
        "border shadow-[inset_0_1px_0_0_rgba(139,92,246,0.08)]",
        accentBorder,
        "bg-[#070a09] text-white",
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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
            </span>
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/25" />
          )}
          <span className={cn("font-bebas text-lg tracking-wide leading-none", accentLive)}>
            Live
          </span>
          <span className="text-white/35 text-xs">·</span>
          <span className="font-bebas text-lg tracking-wide leading-none">Week {week}</span>
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-bold">
            {variant === "weekly" ? "Weekly" : "Season"}
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
            {variant === "season" && me.seasonPoints != null ? (
              <>
                Season · #{me.rank} · {me.seasonPoints} pts · this week {me.weekPoints} pts
              </>
            ) : (
              <>
                Week · #{me.rank} · {me.weekPoints} pts
              </>
            )}
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
              variant === "weekly"
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                : "border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
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
          style={{
            minWidth: STICKY_PLAYER_W + games.length * GAME_COL_MIN + 56 + (showWeeklyTbCol ? 92 : 0),
          }}
        >
          <thead className={cn("z-20", STICKY_BG)}>
            <tr className="border-b border-white/[0.08]">
              <th
                className={cn("sticky left-0 z-30 text-left align-bottom pb-1 pl-2 pr-1", STICKY_BG)}
                style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Player
                </span>
              </th>
              {games.map((game) => (
                <th key={game.id} className="align-bottom font-normal">
                  <GameHeader game={game} />
                </th>
              ))}
              {showWeeklyTbCol && weeklyTbColumnHeader && (
                <th className="align-bottom font-normal px-1 pb-1">
                  <TiebreakerStandingsColumnHeader
                    sport="nfl"
                    matchup={weeklyTbMatchup ?? null}
                    headerFallback={weeklyTbColumnHeader}
                    actual={weeklyTb?.actual ?? null}
                    className="border-l-yellow-500/25 text-yellow-300/90 max-w-[5.5rem]"
                  />
                </th>
              )}
              <th
                className={cn(
                  "sticky right-0 z-30 text-right align-bottom pb-1 pl-1 pr-2",
                  STICKY_BG,
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
                    isMe
                      ? variant === "weekly"
                        ? "bg-cyan-500/[0.08]"
                        : "bg-violet-500/[0.08]"
                      : idx % 2 === 1
                        ? "bg-white/[0.02]"
                        : "",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 py-2 pl-2 pr-1 align-middle",
                      STICKY_BG,
                      isMe && "bg-[#0e1218]",
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
                          isMe ? accentLive : "text-white/90",
                        )}
                      >
                        {row.name}
                      </span>
                    </div>
                  </td>
                  {games.map((game) => {
                    const pick = row.picks[game.id];
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
                  {showWeeklyTbCol && weeklyTbColumnHeader && (
                    <td className="py-1.5 px-1 text-center align-middle">
                      <TiebreakerStandingsColumnGuess
                        guess={row.weeklyTiebreakerGuess}
                        className="border-l-yellow-500/25"
                      />
                    </td>
                  )}
                  <td
                    className={cn(
                      "sticky right-0 z-10 py-2 pl-1 pr-2 text-right align-middle",
                      STICKY_BG,
                      isMe && "bg-[#0e1218]",
                    )}
                  >
                    <span className="font-mono text-sm font-bold tabular-nums text-white/90">
                      {row.weekPoints}
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
