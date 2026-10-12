import { useCallback, useMemo, useRef } from "react";
import {
  useGetNflPickEmSeasonWeekResults,
  getGetNflPickEmSeasonWeekResultsQueryKey,
} from "@workspace/api-client-react";
import type {
  NflPickEmSeasonGame,
  NflPickEmSeasonLeaderboardEntry,
  NflPickEmSeasonPlayerPick,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { ChevronRight, Crosshair, LayoutGrid, Loader2 } from "lucide-react";
import {
  formatNflLiveGameStatusLabel,
  formatSecondsAgo,
  resolveNflPickEmLivePickCellState,
  type LivePickCellState,
} from "@/lib/nflPickEmLivePickCell";

const GAME_COL_MIN = 52;
const STICKY_PLAYER_W = 108;
const STICKY_BG = "bg-[#0c1210]";

function PickCell({ state, abbr }: { state: LivePickCellState; abbr: string | null }) {
  if (state === "hidden" || !abbr) {
    return <span className="text-white/15 text-xs font-mono">—</span>;
  }

  const styles: Record<Exclude<LivePickCellState, "hidden">, string> = {
    correct: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
    incorrect: "border-red-400/45 bg-red-500/15 text-red-200",
    push: "border-white/20 bg-white/[0.06] text-white/60",
    live_winning:
      "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30",
    live_losing:
      "border-red-400/35 bg-red-500/10 text-red-300/90 ring-1 ring-red-400/20",
    pending: "border-white/15 bg-white/[0.04] text-white/80",
  };

  return (
    <span
      className={cn(
        "inline-flex min-w-[40px] items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] font-bold tracking-tight border",
        styles[state],
      )}
    >
      {abbr}
    </span>
  );
}

function GameHeader({ game }: { game: NflPickEmSeasonGame }) {
  const live = game.status === "in_progress";
  const final = game.status === "final";
  const score =
    game.awayScore != null && game.homeScore != null
      ? `${game.awayScore}–${game.homeScore}`
      : "—";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 py-1.5 px-0.5 min-w-[52px]",
        live && "relative",
      )}
    >
      {live && (
        <span className="absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
      )}
      <div className="text-[9px] font-semibold text-white/45 whitespace-nowrap leading-tight">
        <span>{game.awayTeam.abbreviation}</span>
        <span className="text-white/25 mx-0.5">@</span>
        <span>{game.homeTeam.abbreviation}</span>
      </div>
      <span
        className={cn(
          "font-mono text-[11px] font-bold tabular-nums leading-none",
          live ? "text-emerald-300" : final ? "text-white/90" : "text-white/35",
        )}
      >
        {score}
      </span>
      <span
        className={cn(
          "text-[8px] font-bold uppercase tracking-wider leading-none max-w-[52px] truncate",
          live ? "text-emerald-400/90" : final ? "text-white/30" : "text-white/40",
        )}
      >
        {formatNflLiveGameStatusLabel(game)}
      </span>
    </div>
  );
}

export type NflPickEmSeasonLiveBoardProps = {
  poolId: number;
  week: number;
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentUserId: number | null;
  liveGamesInProgress?: number;
  scoringMode?: "straight" | "ats";
};

export function NflPickEmSeasonLiveBoard({
  poolId,
  week,
  entries,
  currentUserId,
  liveGamesInProgress = 0,
  scoringMode = "straight",
}: NflPickEmSeasonLiveBoardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const weekParams = useMemo(() => ({ week }), [week]);

  const { data: weekData, isLoading, dataUpdatedAt, isFetching } =
    useGetNflPickEmSeasonWeekResults(poolId, weekParams, {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, weekParams),
        staleTime: 30_000,
        refetchInterval: (query) =>
          query.state.data?.games.some((g) => g.status === "in_progress")
            ? 15_000
            : 60_000,
      },
    });

  const games = weekData?.games ?? [];
  const weekPlayerMap = useMemo(() => {
    const m = new Map<
      number,
      { correct: number; picks: NflPickEmSeasonPlayerPick[] }
    >();
    for (const p of weekData?.players ?? []) {
      m.set(p.userId, { correct: p.correct, picks: p.picks });
    }
    return m;
  }, [weekData?.players]);

  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const wp = weekPlayerMap.get(entry.userId);
        return {
          entry,
          weekCorrect: wp?.correct ?? 0,
          picks: wp?.picks ?? [],
        };
      }),
    [entries, weekPlayerMap],
  );

  const me = entries.find((e) => e.userId === currentUserId);

  const jumpToMe = useCallback(() => {
    if (currentUserId == null) return;
    rowRefs.current.get(currentUserId)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [currentUserId]);

  const showLivePulse = liveGamesInProgress > 0 || games.some((g) => g.status === "in_progress");

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide">No players yet</p>
      </div>
    );
  }

  if (isLoading && !weekData) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-20 rounded-xl",
          "border border-emerald-500/20 bg-[#070a09] text-white/50",
        )}
      >
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400/80" />
        <p className="font-bebas text-lg tracking-wide">Loading live board…</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div
        className={cn(
          "text-center py-16 rounded-xl border border-emerald-500/15 bg-[#070a09] text-white/50",
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
        "border border-emerald-500/20 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.08)]",
        "bg-[#070a09] text-white",
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5",
          "border-b border-emerald-500/15 bg-[#0a100e]/95 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {showLivePulse ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/25" />
          )}
          <span className="font-bebas text-lg tracking-wide text-emerald-300 leading-none">
            Live
          </span>
          <span className="text-white/35 text-xs">·</span>
          <span className="font-bebas text-lg tracking-wide leading-none">Week {week}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50 ml-auto">
          {showLivePulse && (
            <>
              <span className="font-mono tabular-nums">
                {liveGamesInProgress || games.filter((g) => g.status === "in_progress").length}{" "}
                live
              </span>
              <span className="text-white/25">·</span>
            </>
          )}
          <span className="font-mono tabular-nums">
            Updated {formatSecondsAgo(dataUpdatedAt)}
            {isFetching ? " · …" : ""}
          </span>
        </div>
        {me && (
          <p className="w-full text-[10px] text-white/40 leading-snug">
            Season · #{me.rank} · {me.seasonCorrect}/{me.seasonTotal} correct
            {(me.liveCorrect ?? 0) > 0 && (
              <span className="text-emerald-400/90">
                {" "}
                · +{me.liveCorrect} live this week
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-[#0c1210]/80">
        <p className="text-[10px] text-white/45">
          Full week · scroll games{" "}
          <ChevronRight className="inline w-3 h-3 text-white/30" aria-hidden />
        </p>
        {currentUserId != null && (
          <button
            type="button"
            onClick={jumpToMe}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            <Crosshair className="w-3 h-3" />
            Jump to me
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-visible [scrollbar-width:thin] scrollbar-thumb-white/10"
      >
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: STICKY_PLAYER_W + games.length * GAME_COL_MIN + 56 }}
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
              <th
                className={cn(
                  "sticky right-0 z-30 text-right align-bottom pb-1 pl-1 pr-2",
                  STICKY_BG,
                )}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Wk
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, weekCorrect, picks }, idx) => {
              const isMe = entry.userId === currentUserId;
              const pickByGame = new Map(picks.map((p) => [p.gameId, p]));

              return (
                <tr
                  key={entry.userId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(entry.userId, el);
                  }}
                  className={cn(
                    "border-b border-white/[0.05]",
                    isMe ? "bg-emerald-500/[0.08]" : idx % 2 === 1 ? "bg-white/[0.02]" : "",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 py-2 pl-2 pr-1 align-middle",
                      STICKY_BG,
                      isMe && "bg-[#0e1613]",
                    )}
                    style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-baseline gap-1 min-w-0">
                        <span
                          className={cn(
                            "font-mono text-[10px] font-bold tabular-nums shrink-0 w-4",
                            entry.rank === 1
                              ? "text-amber-300"
                              : entry.rank <= 3
                                ? "text-white/50"
                                : "text-white/30",
                          )}
                        >
                          {entry.rank}
                        </span>
                        <span
                          className={cn(
                            "font-bebas text-sm tracking-wide truncate leading-none",
                            isMe ? "text-emerald-200" : "text-white/90",
                          )}
                        >
                          {entry.displayName || entry.username}
                        </span>
                      </div>
                      {(entry.liveCorrect ?? 0) > 0 && (
                        <span className="text-[9px] font-mono text-emerald-400/80 pl-5">
                          +{entry.liveCorrect} live
                        </span>
                      )}
                    </div>
                  </td>
                  {games.map((game) => {
                    const pick = pickByGame.get(game.id);
                    const { state, abbr } = resolveNflPickEmLivePickCellState(
                      pick,
                      game,
                      scoringMode,
                    );
                    return (
                      <td key={game.id} className="py-1.5 px-0.5 text-center align-middle">
                        <PickCell state={state} abbr={abbr} />
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "sticky right-0 z-10 py-2 pl-1 pr-2 text-right align-middle",
                      STICKY_BG,
                      isMe && "bg-[#0e1613]",
                    )}
                  >
                    <span className="font-mono text-sm font-bold tabular-nums text-white/90">
                      {weekCorrect}
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
