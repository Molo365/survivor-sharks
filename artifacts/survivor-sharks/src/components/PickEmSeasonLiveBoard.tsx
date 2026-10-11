import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetNflPickEmSeasonWeekResults,
  getGetNflPickEmSeasonWeekResultsQueryKey,
} from "@workspace/api-client-react";
import type {
  NflPickEmSeasonGame,
  NflPickEmSeasonLeaderboardEntry,
  NflPickEmSeasonPlayerPick,
} from "@workspace/api-client-react";
import { nflAtsSpreadLabelForTeam } from "@/lib/nflAtsSpreadLabel";
import { PickVisibilityNotice } from "@/components/PickVisibilityNotice";

function formatUpdatedEt(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(ms));
}

function gameStatusLabel(game: NflPickEmSeasonGame): string | null {
  if (game.status === "final") return "Final";
  if (game.status === "in_progress") return game.liveDetail ?? "Live";
  return null;
}

function headerSpread(game: NflPickEmSeasonGame): string | null {
  if (game.spread == null || !game.favoriteTeamId) return null;
  const favIsHome = game.favoriteTeamId === game.homeTeam.id;
  const line = favIsHome ? `-${game.spread}` : `+${game.spread}`;
  const favAbbr = favIsHome ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
  return `${favAbbr} ${line}`;
}

export interface PickEmSeasonLiveBoardProps {
  poolId: number;
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentWeek: number;
  currentUserId: number | null;
  isAtsMode?: boolean;
}

export function PickEmSeasonLiveBoard({
  poolId,
  entries,
  currentWeek,
  currentUserId,
  isAtsMode = false,
}: PickEmSeasonLiveBoardProps) {
  const [displayWeek, setDisplayWeek] = useState(currentWeek);

  useEffect(() => {
    setDisplayWeek(currentWeek);
  }, [currentWeek]);

  const weekParams = useMemo(() => ({ week: displayWeek }), [displayWeek]);
  const {
    data: weekData,
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useGetNflPickEmSeasonWeekResults(poolId, weekParams, {
    query: {
      queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, weekParams),
      staleTime: 30_000,
      refetchInterval: (query) =>
        query.state.data?.games.some((game) => game.status === "in_progress")
          ? 15_000
          : 60_000,
    },
  });

  const games = weekData?.games ?? [];
  const weekPlayers = weekData?.players ?? [];
  const hasLive = games.some((g) => g.status === "in_progress");

  const weekStatsByUser = useMemo(
    () => new Map(weekPlayers.map((p) => [p.userId, p])),
    [weekPlayers],
  );

  const entryMap = useMemo(
    () => new Map(entries.map((e) => [e.userId, e])),
    [entries],
  );

  const rows = useMemo(
    () =>
      entries.map((e) => ({
        ...e,
        picks: weekPlayers.find((p) => p.userId === e.userId)?.picks ?? [],
      })),
    [entries, weekPlayers],
  );

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide">No picks yet</p>
        <p className="text-sm mt-1">Submit picks to see the live board.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PickVisibilityNotice kind="pickem-season" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-bebas text-2xl tracking-wide text-foreground shrink-0">
            Week {displayWeek}
          </h3>
          {displayWeek === currentWeek && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full px-2.5 py-1 border",
                hasLive
                  ? "border-green-500/40 bg-green-500/15 text-green-400"
                  : "border-green-500/25 bg-green-500/10 text-green-400/80",
              )}
            >
              {hasLive && (
                <Radio className="w-3 h-3 animate-pulse" aria-hidden />
              )}
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDisplayWeek((w) => Math.max(1, w - 1))}
            disabled={displayWeek <= 1}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDisplayWeek((w) => Math.min(currentWeek, w + 1))}
            disabled={displayWeek >= currentWeek}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {hasLive && (
        <p className="text-xs text-muted-foreground leading-snug">
          Scores and week points update as games finish. Season standings on the Leaderboard tab refresh on the same schedule.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-xl tracking-wide">No games this week</p>
        </div>
      ) : (
        <div className="rounded-xl border border-green-500/20 bg-green-500/[0.03] overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm border-collapse"
              style={{
                minWidth: `${Math.max(380, 220 + games.length * 72 + 100)}px`,
              }}
            >
              <thead>
                <tr className="border-b border-border/25 bg-card/80">
                  <th
                    rowSpan={2}
                    className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 sticky left-0 bg-card z-20 align-bottom"
                  >
                    Player
                  </th>
                  {games.map((game) => {
                    const spread = isAtsMode ? headerSpread(game) : null;
                    return (
                      <th
                        key={game.id}
                        className="px-1 py-1.5 text-center min-w-[72px] align-bottom"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
                            <span>{game.awayTeam.abbreviation}</span>
                            <span className="text-muted-foreground/40">@</span>
                            <span>{game.homeTeam.abbreviation}</span>
                          </div>
                          {spread && (
                            <span className="text-[9px] font-mono text-yellow-400/90">
                              {spread}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th
                    rowSpan={2}
                    className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap align-bottom"
                  >
                    Week
                  </th>
                  <th
                    rowSpan={2}
                    className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap align-bottom"
                  >
                    Season
                  </th>
                </tr>
                <tr className="border-b border-border/20 bg-muted/[0.04]">
                  {games.map((game) => {
                    const status = gameStatusLabel(game);
                    const hasScore =
                      game.awayScore != null && game.homeScore != null;
                    return (
                      <th key={`${game.id}-score`} className="px-1 py-1 text-center">
                        <div className="flex flex-col items-center gap-0.5 min-h-[2.25rem] justify-center">
                          {hasScore ? (
                            <span className="text-[11px] font-bold text-foreground tabular-nums">
                              {game.awayScore}–{game.homeScore}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30">—</span>
                          )}
                          {status && (
                            <span
                              className={cn(
                                "text-[8px] font-bold uppercase tracking-wide leading-none px-1 rounded",
                                game.status === "in_progress"
                                  ? "text-red-400 bg-red-500/10"
                                  : "text-muted-foreground/60",
                              )}
                            >
                              {status}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const isMe = row.userId === currentUserId;
                  const pickMap = new Map(
                    row.picks.map((p) => [p.gameId, p]),
                  );
                  const seasonEntry = entryMap.get(row.userId);
                  const weekStats = weekStatsByUser.get(row.userId);
                  const seasonPct =
                    seasonEntry && seasonEntry.seasonTotal > 0
                      ? Math.round(
                          (seasonEntry.seasonCorrect / seasonEntry.seasonTotal) *
                            100,
                        )
                      : null;

                  return (
                    <tr
                      key={row.userId}
                      className={cn(
                        "border-b border-border/10 last:border-0",
                        isMe
                          ? "bg-primary/5"
                          : rowIdx % 2 === 0
                            ? "bg-transparent"
                            : "bg-muted/[0.03]",
                      )}
                    >
                      <td
                        className={cn(
                          "px-3 py-2 font-medium whitespace-nowrap sticky left-0 z-10",
                          isMe
                            ? "text-primary bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-primary)_3%)]"
                            : "text-foreground bg-card",
                        )}
                      >
                        <span
                          className={cn(
                            "font-bebas text-base mr-2 w-5 inline-block text-center",
                            row.rank === 1
                              ? "text-yellow-400"
                              : row.rank === 2
                                ? "text-zinc-300"
                                : row.rank === 3
                                  ? "text-amber-600"
                                  : "text-muted-foreground/40",
                          )}
                        >
                          {row.rank}
                        </span>
                        {row.displayName || row.username}
                        {isMe && (
                          <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                            you
                          </span>
                        )}
                      </td>

                      {games.map((game) => (
                        <PickCell
                          key={game.id}
                          game={game}
                          pick={pickMap.get(game.id)}
                          isAtsMode={isAtsMode}
                        />
                      ))}

                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        {weekStats ? (
                          <>
                            <span className="font-bebas text-lg text-green-400">
                              {weekStats.correct}
                            </span>
                            <span className="font-bebas text-sm text-muted-foreground/40">
                              /{weekStats.total}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground/20 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {seasonEntry ? (
                          <>
                            <span className="font-bebas text-xl text-foreground">
                              {seasonEntry.seasonCorrect}
                            </span>
                            <span className="font-bebas text-sm text-muted-foreground/40">
                              /{seasonEntry.seasonTotal}
                            </span>
                            {seasonPct !== null && (
                              <div className="text-[10px] text-muted-foreground/50 leading-none">
                                {seasonPct}%
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground/20 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/60 px-0.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30 shrink-0" />
            Win
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30 shrink-0" />
            Loss
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-muted/20 border border-border/30 shrink-0" />
            Pending
          </span>
        </div>
        <span className="tabular-nums">
          {isFetching && !isLoading ? "Updating… · " : ""}
          Updated {formatUpdatedEt(dataUpdatedAt)}
          {hasLive ? " · refreshes ~15s" : " · refreshes ~60s"}
        </span>
      </div>
    </div>
  );
}

function PickCell({
  game,
  pick,
  isAtsMode,
}: {
  game: NflPickEmSeasonGame;
  pick?: NflPickEmSeasonPlayerPick;
  isAtsMode: boolean;
}) {
  if (!pick || !pick.pickedTeamId) {
    return (
      <td className="px-1 py-2 text-center">
        <span className="text-muted-foreground/20 text-xs">—</span>
      </td>
    );
  }

  const pickedIsHome = pick.pickedTeamId === game.homeTeam.id;
  const team = pickedIsHome ? game.homeTeam : game.awayTeam;
  const spreadLabel =
    isAtsMode && pick.pickedTeamId
      ? nflAtsSpreadLabelForTeam(pick.pickedTeamId, game)
      : null;

  return (
    <td className="px-1 py-2 text-center">
      <div
        className={cn(
          "inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 border min-w-[52px]",
          pick.result === "correct"
            ? "border-green-500/40 bg-green-500/10"
            : pick.result === "incorrect"
              ? "border-red-500/40 bg-red-500/10"
              : "border-border/30 bg-muted/10",
        )}
      >
        {team.logoUrl && (
          <div className="rounded-full bg-white/90 p-0.5 shrink-0">
            <img
              src={team.logoUrl}
              alt={team.abbreviation}
              className="w-5 h-5 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        <span
          className={cn(
            "font-bebas text-[11px] tracking-wide leading-none",
            pick.result === "correct"
              ? "text-green-400"
              : pick.result === "incorrect"
                ? "text-red-400"
                : "text-muted-foreground/70",
          )}
        >
          {team.abbreviation}
        </span>
        {spreadLabel && (
          <span className="font-mono text-[10px] font-semibold text-yellow-400 leading-none">
            {spreadLabel}
          </span>
        )}
      </div>
    </td>
  );
}
