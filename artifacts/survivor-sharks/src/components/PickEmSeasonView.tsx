import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import {
  useGetNflPickEmSeasonGames,
  useSubmitNflPickEmSeasonPicks,
  useGetNflPickEmSeasonLeaderboard,
  useProcessNflPickEmSeasonResults,
  useGetNflPickEmSeasonWeekResults,
  useSetNflPickEmSeasonSandboxWeek,
  useSimulateNflPickEmSeasonGrading,
  getGetNflPickEmSeasonGamesQueryKey,
  getGetNflPickEmSeasonLeaderboardQueryKey,
  getGetNflPickEmSeasonWeekResultsQueryKey,
} from "@workspace/api-client-react";
import type {
  NflPickEmSeasonGame,
  NflPickEmSeasonLeaderboardEntry,
  NflPickEmSeasonSlate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Target,
  Trophy,
  LayoutGrid,
  BarChart2,
  ShieldAlert,
  Check,
  X,
  Lock,
  RefreshCw,
  Clock,
  Copy,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invalidatePoolQueries } from "@/lib/queryUtils";

const NFL_TOTAL_WEEKS = 18;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatGameTimeEt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── NflGameCard ───────────────────────────────────────────────────────────────

function NflGameCard({
  game,
  pickedTeamId,
  onPick,
}: {
  game: NflPickEmSeasonGame;
  pickedTeamId: string | null;
  onPick: (gameId: string, teamId: string) => void;
}) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isPPD = game.status === "postponed";
  const isLocked = game.deadlinePassed;

  const awayWon =
    isFinal &&
    game.awayScore != null &&
    game.homeScore != null &&
    game.awayScore > game.homeScore;
  const homeWon =
    isFinal &&
    game.awayScore != null &&
    game.homeScore != null &&
    game.homeScore > game.awayScore;

  const pickedAway = pickedTeamId === game.awayTeam.id;
  const pickedHome = pickedTeamId === game.homeTeam.id;
  const awayResult = pickedAway ? (game.userPickResult ?? null) : null;
  const homeResult = pickedHome ? (game.userPickResult ?? null) : null;

  function teamBorderClass(isPicked: boolean, result: string | null) {
    if (isPicked) {
      if (result === "correct")
        return "border-green-500/60 bg-green-500/[0.08]";
      if (result === "incorrect")
        return "border-destructive/50 bg-destructive/[0.05]";
      return "border-primary/60 bg-primary/[0.08]";
    }
    if (isLocked)
      return "border-border/20 bg-transparent";
    return "border-border/30 bg-transparent hover:border-border/60 hover:bg-muted/10";
  }

  function PickBadge({ result }: { result: string | null }) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-1.5 py-0.5",
          result === "correct"
            ? "text-green-400 bg-green-500/15"
            : result === "incorrect"
              ? "text-red-400 bg-red-500/15"
              : "text-primary/70 bg-primary/10",
        )}
      >
        {result === "correct" ? (
          <Check className="w-2.5 h-2.5" />
        ) : result === "incorrect" ? (
          <X className="w-2.5 h-2.5" />
        ) : null}
        {result === "correct"
          ? "Correct"
          : result === "incorrect"
            ? "Wrong"
            : "Your pick"}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="flex items-stretch min-h-[92px]">
        {/* Away team */}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => !isLocked && onPick(game.id, game.awayTeam.id)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1.5 px-3 py-4 text-center transition-all border-2 rounded-l-xl",
            teamBorderClass(pickedAway, awayResult),
            isLocked && !pickedAway ? "cursor-default opacity-70" : "cursor-pointer",
          )}
        >
          {game.awayTeam.logoUrl && (
            <img
              src={game.awayTeam.logoUrl}
              alt={game.awayTeam.abbreviation}
              className="w-9 h-9 object-contain"
            />
          )}
          <span className="font-bebas text-lg tracking-wide leading-none">
            {game.awayTeam.abbreviation}
          </span>
          {game.awayRecord && (
            <span className="text-[10px] text-muted-foreground/60 leading-none">
              {game.awayRecord}
            </span>
          )}
          {isFinal && game.awayScore != null && (
            <span
              className={cn(
                "font-bebas text-2xl leading-none",
                awayWon ? "text-green-400" : "text-muted-foreground/50",
              )}
            >
              {game.awayScore}
            </span>
          )}
          {pickedAway && <PickBadge result={awayResult} />}
        </button>

        {/* Center column */}
        <div className="flex flex-col items-center justify-center gap-1 min-w-[72px] sm:min-w-[88px] px-2 border-x border-border/20 bg-muted/[0.02] shrink-0">
          {isLive ? (
            <>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-red-400 leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
              {game.liveDetail && (
                <span className="text-[10px] text-muted-foreground/70 text-center leading-tight">
                  {game.liveDetail}
                </span>
              )}
            </>
          ) : isFinal ? (
            <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
              Final
            </span>
          ) : isPPD ? (
            <span className="text-xs font-semibold text-yellow-400/80 uppercase tracking-wider">
              PPD
            </span>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium leading-none">
                vs
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                <span className="text-[11px] font-semibold text-foreground/80 leading-none whitespace-nowrap">
                  {formatGameTimeEt(game.startTime)}
                </span>
              </div>
              {isLocked && (
                <Lock className="w-3 h-3 text-yellow-400/60 mt-0.5" />
              )}
            </>
          )}
        </div>

        {/* Home team */}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => !isLocked && onPick(game.id, game.homeTeam.id)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1.5 px-3 py-4 text-center transition-all border-2 rounded-r-xl",
            teamBorderClass(pickedHome, homeResult),
            isLocked && !pickedHome ? "cursor-default opacity-70" : "cursor-pointer",
          )}
        >
          {game.homeTeam.logoUrl && (
            <img
              src={game.homeTeam.logoUrl}
              alt={game.homeTeam.abbreviation}
              className="w-9 h-9 object-contain"
            />
          )}
          <span className="font-bebas text-lg tracking-wide leading-none">
            {game.homeTeam.abbreviation}
          </span>
          {game.homeRecord && (
            <span className="text-[10px] text-muted-foreground/60 leading-none">
              {game.homeRecord}
            </span>
          )}
          {isFinal && game.homeScore != null && (
            <span
              className={cn(
                "font-bebas text-2xl leading-none",
                homeWon ? "text-green-400" : "text-muted-foreground/50",
              )}
            >
              {game.homeScore}
            </span>
          )}
          {pickedHome && <PickBadge result={homeResult} />}
        </button>
      </div>
    </div>
  );
}

// ── WeekStrip ─────────────────────────────────────────────────────────────────

function WeekStrip({
  currentWeek,
  displayWeek,
  onWeekChange,
  entries,
  currentUserId,
}: {
  currentWeek: number;
  displayWeek: number;
  onWeekChange: (w: number) => void;
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentUserId: number | null;
}) {
  const myEntry = useMemo(
    () => entries.find((e) => e.userId === currentUserId),
    [entries, currentUserId],
  );

  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-1 pb-1">
        {Array.from({ length: NFL_TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
          const isActive = w === displayWeek;
          const isCurrent = w === currentWeek;
          const isFuture = w > currentWeek;
          const weekScore = myEntry?.weeklyScores?.[String(w)] as
            | { correct: number; total: number }
            | undefined;

          return (
            <button
              key={w}
              type="button"
              onClick={() => onWeekChange(w)}
              className={cn(
                "shrink-0 flex flex-col items-center justify-center rounded-lg border min-w-[48px] px-2 py-1.5 transition-all",
                isActive
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : isFuture
                    ? "border-border/15 bg-transparent text-muted-foreground/30 hover:border-border/30"
                    : "border-border/30 bg-transparent text-muted-foreground/70 hover:border-border/50 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "font-bebas text-sm leading-none",
                  isActive
                    ? "text-primary"
                    : isFuture
                      ? "text-muted-foreground/30"
                      : "text-muted-foreground/70",
                )}
              >
                W{w}
              </span>
              {isCurrent && (
                <span className="text-[8px] uppercase tracking-widest text-primary/60 leading-none mt-0.5">
                  now
                </span>
              )}
              {weekScore && (
                <span className="text-[9px] text-muted-foreground/60 leading-none font-mono">
                  {weekScore.correct}/{weekScore.total}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── WeekResultsModal ──────────────────────────────────────────────────────────

function WeekResultsModal({
  open,
  onClose,
  poolId,
  week,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  poolId: number;
  week: number;
  currentUserId: number | null;
}) {
  const params = useMemo(() => ({ week }), [week]);
  const { data, isLoading } = useGetNflPickEmSeasonWeekResults(poolId, params, {
    query: {
      queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, params),
      enabled: open && week > 0,
      staleTime: 5 * 60 * 1000,
    },
  });

  const games = data?.games ?? [];
  const players = data?.players ?? [];

  const teamAbbrMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of games) {
      m.set(g.awayTeam.id, g.awayTeam.abbreviation);
      m.set(g.homeTeam.id, g.homeTeam.abbreviation);
    }
    return m;
  }, [games]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[min(95vw,960px)] p-0 gap-0 flex flex-col overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Week {week} Results
          </DialogTitle>
          {data && (
            <DialogDescription>
              {players.length} player{players.length !== 1 ? "s" : ""} ·{" "}
              {games.length} game{games.length !== 1 ? "s" : ""}
              {!data.hasResults && " · not yet graded"}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="overflow-auto flex-1 p-4">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : !data?.hasResults || players.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Trophy className="w-9 h-9 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                {players.length === 0
                  ? "No picks recorded for this week."
                  : "Results haven't been graded yet."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm border-collapse"
                  style={{
                    minWidth: `${Math.max(400, 200 + games.length * 72)}px`,
                  }}
                >
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/20">
                      <th className="px-3 py-2.5 text-left font-bebas text-base text-muted-foreground/70 tracking-wide sticky left-0 bg-muted/20 z-10">
                        Player
                      </th>
                      {games.map((g) => (
                        <th
                          key={g.id}
                          className="px-2 py-2.5 text-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider"
                        >
                          {g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right font-bebas text-base text-muted-foreground/70 tracking-wide">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, idx) => {
                      const isMe = player.userId === currentUserId;
                      const pickMap = new Map(
                        player.picks.map((p) => [p.gameId, p]),
                      );
                      const rowBg = isMe
                        ? "bg-primary/5"
                        : idx % 2 === 0
                          ? "bg-transparent"
                          : "bg-muted/[0.03]";
                      return (
                        <tr
                          key={player.userId}
                          className={cn(
                            "border-b border-border/10 last:border-0",
                            rowBg,
                          )}
                        >
                          <td
                            className={cn(
                              "px-3 py-2.5 font-medium whitespace-nowrap sticky left-0 z-10",
                              isMe ? "text-primary" : "text-foreground",
                              rowBg,
                            )}
                          >
                            <span
                              className={cn(
                                "font-bebas text-base mr-2 w-5 inline-block text-center",
                                player.rank === 1
                                  ? "text-yellow-400"
                                  : player.rank === 2
                                    ? "text-zinc-300"
                                    : player.rank === 3
                                      ? "text-amber-600"
                                      : "text-muted-foreground/40",
                              )}
                            >
                              {player.rank}
                            </span>
                            {player.displayName || player.username}
                            {isMe && (
                              <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                                you
                              </span>
                            )}
                          </td>
                          {games.map((g) => {
                            const pick = pickMap.get(g.id);
                            if (!pick)
                              return (
                                <td
                                  key={g.id}
                                  className="px-2 py-2.5 text-center"
                                >
                                  <span className="text-muted-foreground/20 text-xs">
                                    —
                                  </span>
                                </td>
                              );
                            const abbr =
                              teamAbbrMap.get(pick.pickedTeamId) ??
                              pick.pickedTeamName.slice(0, 3).toUpperCase();
                            return (
                              <td
                                key={g.id}
                                className="px-2 py-2.5 text-center"
                              >
                                <span
                                  className={cn(
                                    "text-[11px] font-semibold rounded px-1 py-0.5",
                                    pick.result === "correct"
                                      ? "text-green-300 bg-green-500/15"
                                      : pick.result === "incorrect"
                                        ? "text-red-400 bg-red-500/10"
                                        : "text-muted-foreground/60 bg-muted/20",
                                  )}
                                >
                                  {abbr}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <span className="font-bebas text-xl text-green-400">
                              {player.correct}
                            </span>
                            <span className="font-bebas text-base text-muted-foreground/40">
                              /{player.total}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── WeeklyGrid ────────────────────────────────────────────────────────────────

function WeeklyGrid({
  entries,
  currentWeek,
  currentUserId,
  onWeekClick,
}: {
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentWeek: number;
  currentUserId: number | null;
  onWeekClick: (week: number) => void;
}) {
  const playedWeeks = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      for (const w of Object.keys(e.weeklyScores ?? {})) {
        set.add(Number(w));
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide">No picks yet</p>
        <p className="text-sm mt-1">Submit picks to see the grid.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm border-collapse"
          style={{
            minWidth: `${Math.max(340, 200 + playedWeeks.length * 60)}px`,
          }}
        >
          <thead>
            <tr className="border-b border-border/30 bg-muted/20">
              <th className="px-3 py-2.5 text-left font-bebas text-base text-muted-foreground/70 tracking-wide sticky left-0 bg-muted/20 z-10">
                Player
              </th>
              {playedWeeks.map((w) => (
                <th key={w} className="px-1 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => onWeekClick(w)}
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 hover:bg-muted/30 transition-colors",
                      w === currentWeek
                        ? "text-primary"
                        : "text-muted-foreground/60",
                    )}
                  >
                    W{w}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-bebas text-base text-muted-foreground/70 tracking-wide">
                Season
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const isMe = entry.userId === currentUserId;
              const rowBg = isMe
                ? "bg-primary/5"
                : idx % 2 === 0
                  ? "bg-transparent"
                  : "bg-muted/[0.03]";
              const seasonPct =
                entry.seasonTotal > 0
                  ? Math.round((entry.seasonCorrect / entry.seasonTotal) * 100)
                  : null;
              return (
                <Fragment key={entry.userId}>
                  <tr className={cn("border-b border-border/10 last:border-0", rowBg)}>
                    <td
                      className={cn(
                        "px-3 py-2.5 font-medium whitespace-nowrap sticky left-0 z-10",
                        isMe ? "text-primary" : "text-foreground",
                        rowBg,
                      )}
                    >
                      <span
                        className={cn(
                          "font-bebas text-base mr-2 w-5 inline-block text-center",
                          entry.rank === 1
                            ? "text-yellow-400"
                            : entry.rank === 2
                              ? "text-zinc-300"
                              : entry.rank === 3
                                ? "text-amber-600"
                                : "text-muted-foreground/40",
                        )}
                      >
                        {entry.rank}
                      </span>
                      {entry.displayName || entry.username}
                      {isMe && (
                        <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                          you
                        </span>
                      )}
                    </td>
                    {playedWeeks.map((w) => {
                      const ws = entry.weeklyScores?.[String(w)] as
                        | { correct: number; total: number }
                        | undefined;
                      if (!ws) {
                        return (
                          <td key={w} className={cn("px-1 py-2.5 text-center", rowBg)}>
                            <span className="text-muted-foreground/20 text-xs">—</span>
                          </td>
                        );
                      }
                      const pct =
                        ws.total > 0
                          ? Math.round((ws.correct / ws.total) * 100)
                          : null;
                      return (
                        <td key={w} className={cn("px-1 py-2.5 text-center", rowBg)}>
                          <button
                            type="button"
                            onClick={() => onWeekClick(w)}
                            className="flex flex-col items-center min-w-[38px] rounded hover:bg-muted/20 transition-colors px-1 py-0.5 mx-auto"
                          >
                            <span
                              className={cn(
                                "font-bebas text-lg leading-none",
                                pct !== null && pct >= 60
                                  ? "text-green-400"
                                  : pct !== null && pct < 40
                                    ? "text-red-400/70"
                                    : "text-foreground",
                              )}
                            >
                              {ws.correct}
                            </span>
                            <span className="text-[8px] text-muted-foreground/50 leading-none">
                              /{ws.total}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                    <td className={cn("px-3 py-2.5 text-right", rowBg)}>
                      <span className="font-bebas text-xl text-foreground">
                        {entry.seasonCorrect}
                      </span>
                      <span className="font-bebas text-sm text-muted-foreground/40">
                        /{entry.seasonTotal}
                      </span>
                      {seasonPct !== null && (
                        <div className="text-[10px] text-muted-foreground/50 leading-none">
                          {seasonPct}%
                        </div>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── StatsView ─────────────────────────────────────────────────────────────────

function StatsView({
  entries,
  currentUserId,
  gamesThisWeek,
}: {
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentUserId: number | null;
  gamesThisWeek: number;
}) {
  const totalPlayers = entries.length;
  const totalPicks = entries.reduce((s, e) => s + e.seasonTotal, 0);
  const totalCorrect = entries.reduce((s, e) => s + e.seasonCorrect, 0);
  const avgAccuracy =
    totalPicks > 0 ? Math.round((totalCorrect / totalPicks) * 100) : null;

  const sortedByAccuracy = useMemo(
    () =>
      [...entries]
        .filter((e) => e.seasonTotal > 0)
        .map((e) => ({
          ...e,
          pct: Math.round((e.seasonCorrect / e.seasonTotal) * 100),
        }))
        .sort(
          (a, b) =>
            b.pct - a.pct || b.seasonCorrect - a.seasonCorrect,
        ),
    [entries],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Players
          </p>
          <p className="font-bebas text-3xl text-foreground">{totalPlayers}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Games This Week
          </p>
          <p className="font-bebas text-3xl text-foreground">{gamesThisWeek}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Avg Accuracy
          </p>
          <p className="font-bebas text-3xl text-foreground">
            {avgAccuracy !== null ? `${avgAccuracy}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Total Picks
          </p>
          <p className="font-bebas text-3xl text-foreground">{totalPicks}</p>
        </div>
      </div>

      {sortedByAccuracy.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bebas text-xl tracking-wide text-foreground">
            Accuracy Leaderboard
          </h3>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            {sortedByAccuracy.map((entry, idx) => {
              const isMe = entry.userId === currentUserId;
              return (
                <div
                  key={entry.userId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0",
                    isMe
                      ? "bg-primary/5"
                      : idx % 2 === 0
                        ? "bg-transparent"
                        : "bg-muted/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "font-bebas text-xl w-7 shrink-0 text-center",
                      idx === 0
                        ? "text-yellow-400"
                        : idx === 1
                          ? "text-zinc-300"
                          : idx === 2
                            ? "text-amber-600"
                            : "text-muted-foreground/40",
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className={cn(
                      "flex-1 font-medium truncate",
                      isMe ? "text-primary" : "text-foreground",
                    )}
                  >
                    {entry.displayName || entry.username}
                    {isMe && (
                      <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                        you
                      </span>
                    )}
                  </span>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <div className="w-28 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500/60 rounded-full transition-all"
                        style={{ width: `${entry.pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bebas text-2xl text-green-400">
                      {entry.seasonCorrect}
                    </span>
                    <span className="font-bebas text-xl text-muted-foreground/40">
                      /{entry.seasonTotal}
                    </span>
                    <span className="ml-2 text-xs font-mono text-muted-foreground/60">
                      {entry.pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PickEmSeasonView (main export) ────────────────────────────────────────────

interface PickEmSeasonViewProps {
  poolId: number;
  poolName: string;
  commissionerId: number;
  currentWeek: number;
  inviteCode: string;
  sandboxMode: boolean;
  sandboxWeek: number;
  isSuperAdmin: boolean;
  isActive: boolean;
}

export function PickEmSeasonView({
  poolId,
  poolName,
  commissionerId,
  currentWeek,
  inviteCode,
  sandboxMode,
  sandboxWeek,
  isSuperAdmin,
  isActive,
}: PickEmSeasonViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCommissioner = commissionerId === user?.id || user?.role === "admin";

  const [displayWeek, setDisplayWeek] = useState<number>(currentWeek);
  const [localPicks, setLocalPicks] = useState<Map<string, string>>(new Map());
  const [resultsModalWeek, setResultsModalWeek] = useState<number | null>(null);
  const [tbPassingYards, setTbPassingYards] = useState<string>("");
  const [tbRushingYards, setTbRushingYards] = useState<string>("");
  const [sandboxWeekInput, setSandboxWeekInput] = useState<string>(
    String(sandboxWeek),
  );

  const isWeek18 = displayWeek === NFL_TOTAL_WEEKS;

  useEffect(() => {
    setLocalPicks(new Map());
  }, [displayWeek]);

  const gamesParams = useMemo(() => ({ week: displayWeek }), [displayWeek]);

  const slateRef = useRef<NflPickEmSeasonSlate | undefined>(undefined);

  const {
    data: slate,
    isLoading: slateLoading,
    isFetching: slatesFetching,
  } = useGetNflPickEmSeasonGames(poolId, gamesParams, {
    query: {
      queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, gamesParams),
      refetchInterval: (): number => {
        const hasLive = slateRef.current?.games?.some(
          (g) => g.status === "in_progress",
        );
        return hasLive ? 30_000 : 60_000;
      },
    },
  });

  useEffect(() => {
    slateRef.current = slate;
  }, [slate]);

  const { data: leaderboard, isLoading: lbLoading } =
    useGetNflPickEmSeasonLeaderboard(poolId, {
      query: {
        queryKey: getGetNflPickEmSeasonLeaderboardQueryKey(poolId),
        staleTime: 60 * 1000,
      },
    });

  const prevWeek = currentWeek > 1 ? currentWeek - 1 : null;
  const prevWeekParams = useMemo(
    () => (prevWeek !== null ? { week: prevWeek } : undefined),
    [prevWeek],
  );
  const { data: prevWeekResults } = useGetNflPickEmSeasonWeekResults(
    poolId,
    prevWeekParams,
    {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(
          poolId,
          prevWeekParams,
        ),
        enabled: prevWeek !== null,
        staleTime: 10 * 60 * 1000,
      },
    },
  );
  const prevWeekWinners =
    prevWeekResults?.hasResults && prevWeekResults.winners.length > 0
      ? prevWeekResults.winners
      : null;

  useEffect(() => {
    if (!slate?.games) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const g of slate.games) {
        if (g.userPickTeamId && !next.has(g.id)) {
          next.set(g.id, g.userPickTeamId);
        }
      }
      return next;
    });
  }, [slate]);

  function togglePick(gameId: string, teamId: string) {
    setLocalPicks((prev) => {
      const next = new Map(prev);
      if (next.get(gameId) === teamId) {
        next.delete(gameId);
      } else {
        next.set(gameId, teamId);
      }
      return next;
    });
  }

  const submitPicks = useSubmitNflPickEmSeasonPicks();
  const processResults = useProcessNflPickEmSeasonResults();
  const setSandboxWeekMutation = useSetNflPickEmSeasonSandboxWeek();
  const simulateGrading = useSimulateNflPickEmSeasonGrading();

  function handleSubmit() {
    if (!slate) return;

    const picks = Array.from(localPicks.entries()).flatMap(
      ([gameId, teamId]) => {
        const game = slate.games.find((g) => g.id === gameId);
        if (!game || game.deadlinePassed) return [];
        const team =
          teamId === game.awayTeam.id ? game.awayTeam : game.homeTeam;
        return [
          {
            gameId,
            pickedTeamId: teamId,
            pickedTeamName: team.name,
          },
        ];
      },
    );

    if (picks.length === 0) {
      toast({
        title: "No open picks to submit",
        description: "All games may have already started.",
      });
      return;
    }

    if (isWeek18 && !sandboxMode) {
      const py = parseInt(tbPassingYards, 10);
      const ry = parseInt(tbRushingYards, 10);
      if (!py || !ry || isNaN(py) || isNaN(ry)) {
        toast({
          variant: "destructive",
          title: "Tiebreaker required",
          description:
            "Enter combined passing and rushing yards for Week 18.",
        });
        return;
      }
      submitPicks.mutate(
        {
          poolId,
          data: {
            week: displayWeek,
            picks,
            tiebreakerPassingYards: py,
            tiebreakerRushingYards: ry,
          },
        },
        {
          onSuccess: (r) => {
            toast({
              title: "Picks saved!",
              description: `${r.saved} pick${r.saved !== 1 ? "s" : ""} saved.`,
            });
            void invalidatePoolQueries(queryClient, poolId);
          },
          onError: () =>
            toast({
              variant: "destructive",
              title: "Failed to save picks",
              description: "Please try again.",
            }),
        },
      );
      return;
    }

    submitPicks.mutate(
      { poolId, data: { week: displayWeek, picks } },
      {
        onSuccess: (r) => {
          toast({
            title: "Picks saved!",
            description: `${r.saved} pick${r.saved !== 1 ? "s" : ""} saved.`,
          });
          void invalidatePoolQueries(queryClient, poolId);
        },
        onError: () =>
          toast({
            variant: "destructive",
            title: "Failed to save picks",
            description: "Please try again.",
          }),
      },
    );
  }

  function handleGradeResults() {
    processResults.mutate(
      { poolId, data: { week: currentWeek } },
      {
        onSuccess: (r) => {
          toast({
            title: "Results graded!",
            description: `${r.graded} picks graded for Week ${r.week}.`,
          });
          void invalidatePoolQueries(queryClient, poolId);
        },
        onError: () =>
          toast({
            variant: "destructive",
            title: "Grading failed",
            description: "Please try again.",
          }),
      },
    );
  }

  function handleSimulateGrading() {
    simulateGrading.mutate(
      { poolId },
      {
        onSuccess: (r) => {
          toast({
            title: "Simulation complete!",
            description: `${r.graded} picks graded for Week ${r.week}.`,
          });
          void invalidatePoolQueries(queryClient, poolId);
        },
        onError: () =>
          toast({
            variant: "destructive",
            title: "Simulation failed",
            description: "Please try again.",
          }),
      },
    );
  }

  function handleSetSandboxWeek() {
    const w = parseInt(sandboxWeekInput, 10);
    if (!w || w < 1 || w > NFL_TOTAL_WEEKS || isNaN(w)) return;
    setSandboxWeekMutation.mutate(
      { poolId, data: { week: w } },
      {
        onSuccess: () => {
          toast({ title: `Sandbox week set to Week ${w}` });
          void invalidatePoolQueries(queryClient, poolId);
        },
        onError: () =>
          toast({
            variant: "destructive",
            title: "Failed to set sandbox week",
          }),
      },
    );
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteCode);
    toast({ title: "Invite code copied to clipboard!" });
  }

  const openGames = slate?.games.filter((g) => !g.deadlinePassed) ?? [];
  const pendingPickCount = openGames.filter((g) => !localPicks.has(g.id)).length;
  const entries = leaderboard?.entries ?? [];

  return (
    <>
      {resultsModalWeek !== null && (
        <WeekResultsModal
          open
          onClose={() => setResultsModalWeek(null)}
          poolId={poolId}
          week={resultsModalWeek}
          currentUserId={user?.id ?? null}
        />
      )}

      <Tabs defaultValue="picks" className="w-full">
        <div className="relative">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
              <TabsTrigger
                value="picks"
                onClick={() => setDisplayWeek(currentWeek)}
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
              >
                <Target className="w-4 h-4 md:w-5 md:h-5" /> This Week&apos;s Picks
              </TabsTrigger>
              <TabsTrigger
                value="leaderboard"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2"
              >
                <Trophy className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
              </TabsTrigger>
              <TabsTrigger
                value="grid"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
              >
                <LayoutGrid className="w-4 h-4 md:w-5 md:h-5" /> Weekly Grid
              </TabsTrigger>
              <TabsTrigger
                value="stats"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-400 flex gap-2"
              >
                <BarChart2 className="w-4 h-4 md:w-5 md:h-5" /> Stats
              </TabsTrigger>
              {isCommissioner && (
                <TabsTrigger
                  value="commissioner"
                  className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2"
                >
                  <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
        </div>

        <div className="mt-6">
          {/* ── This Week's Picks ── */}
          <TabsContent value="picks" className="m-0 focus-visible:outline-none">
            <div className="space-y-5">
              {/* Week winner banner */}
              {prevWeekWinners && prevWeek !== null && (
                <div className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.08] px-4 py-3">
                  <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-yellow-200">
                      Week {prevWeek} Winner{prevWeekWinners.length > 1 ? "s" : ""}:
                    </span>
                    <span className="text-sm text-yellow-300">
                      {prevWeekWinners
                        .map((w) => w.displayName || w.username)
                        .join(" & ")}
                    </span>
                    <span className="text-yellow-500/50 text-xs">·</span>
                    <span className="text-sm text-yellow-400/70">
                      {prevWeekWinners[0].correct}/{prevWeekWinners[0].total}{" "}
                      correct
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResultsModalWeek(prevWeek)}
                    className="text-xs font-medium text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0 whitespace-nowrap"
                  >
                    View Results →
                  </button>
                </div>
              )}

              {/* Week strip */}
              <WeekStrip
                currentWeek={currentWeek}
                displayWeek={displayWeek}
                onWeekChange={setDisplayWeek}
                entries={entries}
                currentUserId={user?.id ?? null}
              />

              {/* Games */}
              {slateLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              ) : !slate || slate.games.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-bebas text-2xl tracking-wide">
                    No games this week
                  </p>
                  <p className="text-sm mt-1">
                    Check back when the schedule is posted.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Week header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bebas text-2xl tracking-wide leading-none">
                        Week {slate.week}
                        {slate.week === slate.currentWeek && (
                          <span className="ml-2 text-sm font-sans font-normal text-primary/50 tracking-normal">
                            Current
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {slate.games.length} game
                        {slate.games.length !== 1 ? "s" : ""}
                        {openGames.length > 0 && (
                          <>
                            {" "}
                            · {localPicks.size} of {openGames.length} picked
                          </>
                        )}
                      </p>
                    </div>
                    {slatesFetching && !slateLoading && (
                      <Wifi className="w-4 h-4 text-muted-foreground/40 animate-pulse" />
                    )}
                  </div>

                  {!isActive && (
                    <div className="rounded-lg border border-muted/40 bg-muted/10 px-4 py-3 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="text-base">🏁</span>
                      <div>
                        <span className="font-semibold text-foreground/80">Pool Ended</span>
                        <span className="ml-2">This pool has concluded — results are final. No further picks can be made.</span>
                      </div>
                    </div>
                  )}

                  {slate.games.map((game) => (
                    <NflGameCard
                      key={game.id}
                      game={game}
                      pickedTeamId={localPicks.get(game.id) ?? null}
                      onPick={isActive ? togglePick : () => {}}
                    />
                  ))}

                  {/* Week 18 tiebreaker */}
                  {isWeek18 && !sandboxMode && openGames.length > 0 && (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/[0.05] p-5 space-y-3">
                      <div>
                        <h4 className="font-bebas text-xl tracking-wide text-yellow-300 mb-0.5">
                          Week 18 Tiebreaker
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          For tiebreaking purposes, guess the combined totals for
                          all Week 18 games.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Combined Passing Yards
                          </label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="e.g. 4200"
                            value={tbPassingYards}
                            onChange={(e) => setTbPassingYards(e.target.value)}
                            className="bg-background/60"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Combined Rushing Yards
                          </label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="e.g. 2100"
                            value={tbRushingYards}
                            onChange={(e) => setTbRushingYards(e.target.value)}
                            className="bg-background/60"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit */}
                  {isActive && openGames.length > 0 && (
                    <div className="pt-1">
                      <Button
                        onClick={handleSubmit}
                        disabled={
                          submitPicks.isPending || localPicks.size === 0
                        }
                        className="w-full font-bebas text-xl tracking-wider h-12"
                      >
                        {submitPicks.isPending && (
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        )}
                        {pendingPickCount > 0
                          ? `${pendingPickCount} game${pendingPickCount !== 1 ? "s" : ""} unpicked · Save All Picks`
                          : "Save Picks"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Leaderboard ── */}
          <TabsContent
            value="leaderboard"
            className="m-0 focus-visible:outline-none"
          >
            {lbLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-bebas text-2xl tracking-wide">
                  No picks yet this season
                </p>
                <p className="text-sm mt-1">
                  Make picks to appear on the leaderboard.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bebas text-2xl tracking-wide">
                    Season Standings
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {entries.length} player{entries.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  {entries.map((entry, idx) => {
                    const isMe = entry.userId === user?.id;
                    const pct =
                      entry.seasonTotal > 0
                        ? Math.round(
                            (entry.seasonCorrect / entry.seasonTotal) * 100,
                          )
                        : null;
                    return (
                      <div
                        key={entry.userId}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0",
                          isMe
                            ? "bg-primary/5"
                            : idx % 2 === 0
                              ? "bg-transparent"
                              : "bg-muted/[0.03]",
                        )}
                      >
                        <span
                          className={cn(
                            "font-bebas text-xl w-7 shrink-0 text-center",
                            entry.rank === 1
                              ? "text-yellow-400"
                              : entry.rank === 2
                                ? "text-zinc-300"
                                : entry.rank === 3
                                  ? "text-amber-600"
                                  : "text-muted-foreground/40",
                          )}
                        >
                          {entry.rank}
                        </span>
                        <span
                          className={cn(
                            "flex-1 font-medium truncate",
                            isMe ? "text-primary" : "text-foreground",
                          )}
                        >
                          {entry.displayName || entry.username}
                          {isMe && (
                            <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                              you
                            </span>
                          )}
                        </span>
                        <div className="hidden sm:flex items-center gap-2 shrink-0">
                          <div className="w-28 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500/60 rounded-full transition-all"
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bebas text-2xl text-green-400">
                            {entry.seasonCorrect}
                          </span>
                          <span className="font-bebas text-xl text-muted-foreground/40">
                            /{entry.seasonTotal}
                          </span>
                          {pct !== null && (
                            <span className="ml-2 text-xs font-mono text-muted-foreground/60">
                              {pct}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Weekly Grid ── */}
          <TabsContent value="grid" className="m-0 focus-visible:outline-none">
            {lbLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <WeeklyGrid
                entries={entries}
                currentWeek={currentWeek}
                currentUserId={user?.id ?? null}
                onWeekClick={setResultsModalWeek}
              />
            )}
          </TabsContent>

          {/* ── Stats ── */}
          <TabsContent value="stats" className="m-0 focus-visible:outline-none">
            {lbLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <StatsView
                entries={entries}
                currentUserId={user?.id ?? null}
                gamesThisWeek={slate?.games.length ?? 0}
              />
            )}
          </TabsContent>

          {/* ── Commissioner ── */}
          {isCommissioner && (
            <TabsContent
              value="commissioner"
              className="m-0 focus-visible:outline-none"
            >
              <div className="max-w-lg space-y-6">
                <div>
                  <h3 className="font-bebas text-2xl tracking-wide mb-1">
                    Commissioner Tools
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Manage picks, grade results, and control pool settings.
                  </p>
                </div>

                {/* Invite code */}
                <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
                  <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
                  <div className="p-6 space-y-4">
                    <div>
                      <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">
                        Invite Code
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Share this code to let players join.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
                        {inviteCode}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="lg"
                          onClick={copyInvite}
                          className="font-bebas text-xl tracking-wider"
                        >
                          <Copy className="w-5 h-5 mr-2" /> Copy Code
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${window.location.origin}/join/${inviteCode}`,
                            );
                            toast({
                              title: "Invite link copied!",
                              description:
                                "Share it with anyone to let them join.",
                            });
                          }}
                        >
                          <Copy className="w-5 h-5 mr-2" /> Copy Link
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grade results */}
                <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
                  <div>
                    <h4 className="font-bebas text-2xl tracking-wide mb-0.5">
                      Grade Results
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Process Week {currentWeek} results from ESPN. Only run
                      after all games have finished.
                    </p>
                  </div>
                  <Button
                    onClick={handleGradeResults}
                    disabled={processResults.isPending}
                    variant="outline"
                    className="font-bebas text-xl tracking-wider border-green-500/40 text-green-400 hover:bg-green-500/10"
                  >
                    {processResults.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Grade Week {currentWeek} Results
                  </Button>
                </div>

                {/* Sandbox tools */}
                {sandboxMode && isSuperAdmin && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/[0.05] p-6 space-y-4">
                    <div>
                      <h4 className="font-bebas text-2xl tracking-wide text-yellow-300 mb-0.5">
                        Sandbox Tools
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Sandbox mode is active — Week {sandboxWeek}. Super admin
                        only.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={NFL_TOTAL_WEEKS}
                        value={sandboxWeekInput}
                        onChange={(e) => setSandboxWeekInput(e.target.value)}
                        className="w-24 bg-background/60"
                        placeholder="Week"
                      />
                      <Button
                        onClick={handleSetSandboxWeek}
                        disabled={setSandboxWeekMutation.isPending}
                        variant="outline"
                        className="font-bebas text-lg tracking-wider border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10"
                      >
                        {setSandboxWeekMutation.isPending && (
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        )}
                        Load Week
                      </Button>
                    </div>
                    <Button
                      onClick={handleSimulateGrading}
                      disabled={simulateGrading.isPending}
                      variant="outline"
                      className="font-bebas text-xl tracking-wider border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10"
                    >
                      {simulateGrading.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Simulate Grading
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </>
  );
}
