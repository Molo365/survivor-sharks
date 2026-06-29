import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import {
  useGetNflPickEmSeasonGames,
  useSubmitNflPickEmSeasonPicks,
  useGetNflPickEmSeasonLeaderboard,
  useProcessNflPickEmSeasonResults,
  useGetNflPickEmSeasonWeekResults,
  useSetNflPickEmSeasonSandboxWeek,
  useSimulateNflPickEmSeasonGrading,
  useUpdatePool,
  getGetNflPickEmSeasonGamesQueryKey,
  getGetNflPickEmSeasonLeaderboardQueryKey,
  getGetNflPickEmSeasonWeekResultsQueryKey,
  getGetPoolQueryKey,
} from "@workspace/api-client-react";
import type {
  NflPickEmSeasonGame,
  NflPickEmSeasonLeaderboardEntry,
  NflPickEmSeasonSlate,
  NflPickEmSeasonWeekResults,
  NflPickEmSeasonPlayerPick,
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Loader2,
  Info,
  Users,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invalidatePoolQueries } from "@/lib/queryUtils";
import { TiebreakerActualsCard } from "@/components/TiebreakerActualsCard";
import { PickEmSeasonLeaderboard } from "@/components/PickEmSeasonLeaderboard";

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
  forceReadOnly = false,
}: {
  game: NflPickEmSeasonGame;
  pickedTeamId: string | null;
  onPick: (gameId: string, teamId: string) => void;
  forceReadOnly?: boolean;
}) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isPPD = game.status === "postponed";
  const isLocked = game.deadlinePassed || forceReadOnly;

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

  function teamBtnClass(isPicked: boolean, result: string | null) {
    if (isPicked && result === "correct")
      return "border-green-500 bg-green-500/10 ring-2 ring-green-500/40";
    if (isPicked && result === "incorrect")
      return "border-destructive bg-destructive/10 ring-2 ring-destructive/30";
    if (isPicked)
      return "border-primary bg-primary/10 ring-2 ring-primary/40";
    return "border-border/40 bg-card/60 hover:border-border";
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
        {result !== "correct" && result !== "incorrect" ? "My Pick" : null}
      </div>
    );
  }

  function TeamBtn({
    team,
    side,
    score,
    record,
    isPicked,
    result,
  }: {
    team: NflPickEmSeasonGame["awayTeam"];
    side: "away" | "home";
    score: number | null | undefined;
    record: string | null | undefined;
    isPicked: boolean;
    result: string | null;
  }) {
    const isHome = side === "home";
    const isCorrect = result === "correct";
    const isWrong = result === "incorrect";

    return (
      <button
        type="button"
        disabled={isLocked}
        onClick={() => !isLocked && onPick(game.id, team.id)}
        className={cn(
          "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2 transition-all select-none",
          isLocked ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
          teamBtnClass(isPicked, result),
          isHome ? "flex-row-reverse" : "flex-row",
        )}
      >
        {/* Logo in white circle */}
        <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt={team.name}
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted/40 flex items-center justify-center">
              <span className="font-bebas text-xs text-muted-foreground">
                {team.abbreviation.slice(0, 2)}
              </span>
            </div>
          )}
        </div>

        {/* Team info */}
        <div className={cn(
          "flex-1 flex flex-col gap-0.5 min-w-0",
          isHome ? "items-end text-right" : "items-start text-left",
        )}>
          <span className={cn(
            "font-bebas tracking-wide text-base sm:text-xl leading-tight",
            isPicked ? "text-foreground" : "text-muted-foreground",
          )}>
            {team.name}
          </span>

          {record && (
            <span className="text-[12px] text-white font-semibold tabular-nums leading-none">
              {record}
            </span>
          )}

          {(isFinal || isLive) && score != null && (
            <span className={cn(
              "font-bebas text-3xl leading-none mt-0.5",
              isLive
                ? "text-white"
                : isPicked && isCorrect
                  ? "text-green-400"
                  : isPicked && isWrong
                    ? "text-destructive/70"
                    : "text-foreground/60",
            )}>
              {score}
            </span>
          )}

          {isPicked && <PickBadge result={result} />}
        </div>
      </button>
    );
  }

  return (
    <div className={cn(
      "shark-card rounded-xl border overflow-hidden relative",
      isLive
        ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]"
        : "border-border/40",
    )}>
      {/* Pulsing live border overlay */}
      {isLive && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none z-10" />
      )}
      {/* LIVE badge */}
      {isLive && (
        <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shadow-md">
          <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
          Live
        </span>
      )}

      <div className="flex items-stretch gap-0">
        <TeamBtn
          team={game.awayTeam}
          side="away"
          score={game.awayScore}
          record={game.awayRecord}
          isPicked={pickedAway}
          result={awayResult}
        />

        {/* Center divider */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[72px] sm:px-3 sm:min-w-[88px] shrink-0">
          {isLive ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none whitespace-nowrap">
                ● LIVE
              </span>
              {game.liveDetail && (
                <span className="font-bebas text-[11px] text-red-300/80 leading-none tracking-wide whitespace-nowrap">
                  {game.liveDetail}
                </span>
              )}
            </>
          ) : isFinal ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
              Final
            </span>
          ) : isPPD ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/40 leading-none">
              PPD
            </span>
          ) : (
            <>
              <span className="font-bebas text-xs text-muted-foreground/70 tracking-widest uppercase">
                vs
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-primary/60 shrink-0" />
                <span className="text-[11px] sm:text-xs text-muted-foreground leading-tight font-semibold whitespace-nowrap">
                  {formatGameTimeEt(game.startTime)}
                </span>
              </div>
            </>
          )}
        </div>

        <TeamBtn
          team={game.homeTeam}
          side="home"
          score={game.homeScore}
          record={game.homeRecord}
          isPicked={pickedHome}
          result={homeResult}
        />
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
              onClick={isFuture ? undefined : () => onWeekChange(w)}
              disabled={isFuture}
              aria-disabled={isFuture}
              className={cn(
                "shrink-0 flex flex-col items-center justify-center rounded-lg border min-w-[48px] px-2 py-1.5 transition-all",
                isFuture
                  ? "border-border/10 bg-transparent text-muted-foreground/20 cursor-not-allowed opacity-40"
                  : isActive
                    ? "border-primary/60 bg-primary/10 text-primary"
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

// ── PickEmPickCard ────────────────────────────────────────────────────────────

function PickEmPickCard({
  game,
  pick,
}: {
  game?: NflPickEmSeasonGame | null;
  pick: NflPickEmSeasonPlayerPick;
}) {
  const isCorrect = pick.result === "correct";
  const isIncorrect = pick.result === "incorrect";

  const pickedTeam = game
    ? pick.pickedTeamId === game.awayTeam.id
      ? game.awayTeam
      : game.homeTeam
    : null;

  const logoUrl = pickedTeam?.logoUrl ?? null;
  const teamName = pickedTeam?.name ?? pick.pickedTeamName;
  const abbr = pickedTeam?.abbreviation ?? pick.pickedTeamName.slice(0, 3).toUpperCase();
  const matchup = game
    ? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg border",
        isCorrect
          ? "border-green-500/25 bg-green-500/[0.06]"
          : isIncorrect
            ? "border-destructive/25 bg-destructive/[0.06]"
            : "border-border/30 bg-muted/10",
      )}
    >
      {logoUrl ? (
        <div className="shrink-0 w-7 h-7 rounded-full bg-white/90 p-0.5 flex items-center justify-center">
          <img
            src={logoUrl}
            alt={abbr}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center">
          <span className="text-[9px] font-bold uppercase">{abbr}</span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {teamName}
        </p>
        {matchup && (
          <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
            {matchup}
          </p>
        )}
      </div>

      <span
        className={cn(
          "shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border leading-none",
          isCorrect
            ? "text-green-400 bg-green-500/10 border-green-500/25"
            : isIncorrect
              ? "text-destructive/80 bg-destructive/10 border-destructive/25"
              : "text-muted-foreground/40 bg-muted/10 border-border/30",
        )}
      >
        {isCorrect ? "✓" : isIncorrect ? "✗" : "–"}
      </span>
    </div>
  );
}

// ── PickEmPickDetailPanel ─────────────────────────────────────────────────────

function PickEmPickDetailPanel({
  playerName,
  week,
  weekData,
  isLoading,
  userId,
  onClose,
}: {
  playerName: string;
  week: number;
  weekData: NflPickEmSeasonWeekResults | undefined;
  isLoading: boolean;
  userId: number;
  onClose: () => void;
}) {
  const content = useMemo(() => {
    if (!weekData) return null;
    const player = weekData.players.find((p) => p.userId === userId);
    if (!player) return null;
    if (player.picks.length === 0) return [];

    const pickMap = new Map<string, NflPickEmSeasonPlayerPick>(
      player.picks.map((p) => [p.gameId, p]),
    );
    const joined = weekData.games
      .map((game) => ({ game: game as NflPickEmSeasonGame | null, pick: pickMap.get(game.id) ?? null }))
      .filter(({ pick }) => pick !== null) as {
        game: NflPickEmSeasonGame | null;
        pick: NflPickEmSeasonPlayerPick;
      }[];

    // Fallback: if game-join yields nothing but picks exist (ESPN ID mismatch or empty
    // game list for this week), render picks directly from player data without game context.
    if (joined.length === 0) {
      return player.picks.map((pick) => ({
        game: null as NflPickEmSeasonGame | null,
        pick,
      }));
    }

    return joined;
  }, [weekData, userId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
          Week {week} picks — {playerName}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors"
          aria-label="Close picks panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading || !weekData ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
          <span className="text-sm text-muted-foreground/40">
            Loading picks…
          </span>
        </div>
      ) : content && content.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {content.map(({ game, pick }) => (
            <PickEmPickCard key={pick.gameId} game={game} pick={pick} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic py-1">
          No picks submitted this week.
        </p>
      )}
    </div>
  );
}

// ── WeeklyGrid ────────────────────────────────────────────────────────────────

function WeeklyGrid({
  poolId,
  entries,
  currentWeek,
  currentUserId,
}: {
  poolId: number;
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentWeek: number;
  currentUserId: number | null;
}) {
  const hintKey = `pickem-season-grid-hint-${poolId}`;
  const [showHint, setShowHint] = useState<boolean>(() => {
    try {
      return localStorage.getItem(hintKey) !== "1";
    } catch {
      return true;
    }
  });
  const [selectedCell, setSelectedCell] = useState<{
    userId: number;
    week: number;
  } | null>(null);

  const weekResultsParams = useMemo(
    () => (selectedCell ? { week: selectedCell.week } : undefined),
    [selectedCell],
  );
  const { data: weekData, isLoading: weekLoading } =
    useGetNflPickEmSeasonWeekResults(poolId, weekResultsParams, {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(
          poolId,
          weekResultsParams,
        ),
        enabled: !!selectedCell,
        staleTime: 5 * 60 * 1000,
      },
    });

  const playedWeeks = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      for (const w of Object.keys(e.weeklyScores ?? {})) {
        set.add(Number(w));
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [entries]);

  const colSpan = playedWeeks.length + 2;

  function handleCellClick(userId: number, week: number) {
    if (selectedCell?.userId === userId && selectedCell?.week === week) {
      setSelectedCell(null);
    } else {
      setSelectedCell({ userId, week });
    }
  }

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
    <div className="space-y-3">
      {showHint && (
        <div className="relative flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 pr-10">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200/80">
            Click any week&apos;s result to see that player&apos;s picks for
            that week.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(hintKey, "1");
              } catch {
                /* ignore */
              }
              setShowHint(false);
            }}
            className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Dismiss hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm border-collapse"
            style={{
              minWidth: `${Math.max(340, 200 + playedWeeks.length * 60)}px`,
            }}
          >
            <thead>
              <tr className="border-b border-border/20">
                <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 sticky left-0 bg-card z-10">
                  Player
                </th>
                {playedWeeks.map((w) => (
                  <th
                    key={w}
                    className={cn(
                      "px-0.5 py-2 text-center text-[10px] font-bold uppercase tracking-widest",
                      w === currentWeek
                        ? "text-primary/70"
                        : "text-muted-foreground/50",
                    )}
                  >
                    W{w}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Season
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const isMe = entry.userId === currentUserId;
                const isExpanded = selectedCell?.userId === entry.userId;
                const rowBg = isMe
                  ? "bg-primary/5"
                  : idx % 2 === 0
                    ? "bg-transparent"
                    : "bg-muted/[0.03]";
                const seasonPct =
                  entry.seasonTotal > 0
                    ? Math.round(
                        (entry.seasonCorrect / entry.seasonTotal) * 100,
                      )
                    : null;

                return (
                  <Fragment key={entry.userId}>
                    <tr
                      className={cn(
                        "border-b border-border/10",
                        isExpanded ? "border-border/20" : "last:border-0",
                        rowBg,
                      )}
                    >
                      <td
                        className={cn(
                          "px-3 py-2.5 font-medium whitespace-nowrap sticky left-0 z-10",
                          isMe ? "text-primary" : "text-foreground",
                          isMe
                            ? "bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-primary)_3%)]"
                            : "bg-card",
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
                        const isCellActive =
                          isExpanded && selectedCell?.week === w;

                        if (!ws) {
                          return (
                            <td
                              key={w}
                              className={cn("px-1 py-2.5 text-center", rowBg)}
                            >
                              <span className="text-muted-foreground/20 text-xs">
                                —
                              </span>
                            </td>
                          );
                        }

                        const pct =
                          ws.total > 0
                            ? Math.round((ws.correct / ws.total) * 100)
                            : null;

                        return (
                          <td
                            key={w}
                            onClick={() => handleCellClick(entry.userId, w)}
                            title={`${entry.displayName ?? entry.username} — Wk${w}: ${ws.correct}/${ws.total}`}
                            className={cn(
                              "px-1 py-2.5 text-center cursor-pointer select-none transition-colors",
                              isCellActive
                                ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
                                : "hover:bg-muted/40",
                            )}
                          >
                            <div className="flex flex-col items-center min-w-[38px] mx-auto">
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
                            </div>
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

                    {isExpanded && (
                      <tr className="bg-muted/[0.04]">
                        <td
                          colSpan={colSpan}
                          className="px-4 py-4 border-b border-border/30"
                        >
                          <PickEmPickDetailPanel
                            playerName={
                              entry.displayName ?? entry.username ?? "Player"
                            }
                            week={selectedCell!.week}
                            weekData={weekData}
                            isLoading={weekLoading}
                            userId={entry.userId}
                            onClose={() => setSelectedCell(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── StatsView ─────────────────────────────────────────────────────────────────

function StatsView({
  entries,
  currentUserId,
  weekResults,
}: {
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentUserId: number | null;
  weekResults: NflPickEmSeasonWeekResults | undefined;
}) {
  const totalPlayers = entries.length;
  const totalPicks = entries.reduce((s, e) => s + e.seasonTotal, 0);
  const totalCorrect = entries.reduce((s, e) => s + e.seasonCorrect, 0);
  const avgAccuracy =
    totalPicks > 0 ? Math.round((totalCorrect / totalPicks) * 100) : null;
  const gamesThisWeek = weekResults?.games.length ?? 0;

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

  const gamePickStats = useMemo(() => {
    if (!weekResults?.games || !weekResults?.players) return [];
    return weekResults.games
      .map((game) => {
        const awayCount = weekResults.players.filter((p) =>
          p.picks.some(
            (pick) =>
              pick.gameId === game.id &&
              pick.pickedTeamId === game.awayTeam.id,
          ),
        ).length;
        const homeCount = weekResults.players.filter((p) =>
          p.picks.some(
            (pick) =>
              pick.gameId === game.id &&
              pick.pickedTeamId === game.homeTeam.id,
          ),
        ).length;
        const total = awayCount + homeCount;
        return {
          game,
          awayCount,
          homeCount,
          total,
          awayPct: total > 0 ? Math.round((awayCount / total) * 100) : 50,
          homePct: total > 0 ? Math.round((homeCount / total) * 100) : 50,
        };
      })
      .filter((g) => g.total > 0);
  }, [weekResults]);

  return (
    <div className="space-y-6">
      {/* Summary cards — value first, label below (matches MLB) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="font-bebas text-3xl text-accent">{totalPlayers}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 flex items-center justify-center gap-1">
            <Users className="w-3 h-3" /> Players
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="font-bebas text-3xl text-primary">{gamesThisWeek}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
            Games This Week
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="font-bebas text-3xl text-green-400">
            {avgAccuracy !== null ? `${avgAccuracy}%` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
            Avg Accuracy
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
          <p className="font-bebas text-3xl text-yellow-400">{totalPicks}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
            Total Picks
          </p>
        </div>
      </div>

      {/* Accuracy leaderboard */}
      {sortedByAccuracy.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bebas text-xl tracking-wide text-muted-foreground uppercase">
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

      {/* Pick distribution */}
      {gamePickStats.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bebas text-xl tracking-wide text-muted-foreground uppercase">
            Pick Distribution
          </h3>
          <div className="space-y-2">
            {gamePickStats.map(({ game, awayCount, homeCount, awayPct, homePct }) => (
              <div key={game.id} className="rounded-xl border border-border/40 bg-card/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-1">
                    {game.awayTeam.logoUrl && (
                      <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                        <img
                          src={game.awayTeam.logoUrl}
                          alt={game.awayTeam.abbreviation}
                          className="w-4 h-4 object-contain"
                        />
                      </div>
                    )}
                    <span className="font-bebas tracking-wide">{game.awayTeam.abbreviation}</span>
                    <span className="text-muted-foreground ml-auto">
                      {awayCount} {awayCount === 1 ? "pick" : "picks"}
                    </span>
                  </div>
                  <span className="text-muted-foreground/40 shrink-0">@</span>
                  <div className="flex items-center gap-1.5 flex-1 flex-row-reverse">
                    {game.homeTeam.logoUrl && (
                      <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                        <img
                          src={game.homeTeam.logoUrl}
                          alt={game.homeTeam.abbreviation}
                          className="w-4 h-4 object-contain"
                        />
                      </div>
                    )}
                    <span className="font-bebas tracking-wide">{game.homeTeam.abbreviation}</span>
                    <span className="text-muted-foreground mr-auto">
                      {homeCount} {homeCount === 1 ? "pick" : "picks"}
                    </span>
                  </div>
                </div>
                <div className="flex rounded-full overflow-hidden h-3">
                  <div
                    className="bg-blue-500/50 h-full transition-all flex items-center justify-end pr-1"
                    style={{ width: `${awayPct}%` }}
                  >
                    {awayPct >= 25 && (
                      <span className="text-[8px] font-bold text-white">{awayPct}%</span>
                    )}
                  </div>
                  <div
                    className="bg-green-500/50 h-full transition-all flex items-center justify-start pl-1"
                    style={{ width: `${homePct}%` }}
                  >
                    {homePct >= 25 && (
                      <span className="text-[8px] font-bold text-white">{homePct}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

  const currentWeekResultsParams = useMemo(
    () => ({ week: currentWeek }),
    [currentWeek],
  );
  const { data: currentWeekResults } = useGetNflPickEmSeasonWeekResults(
    poolId,
    currentWeekResultsParams,
    {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(
          poolId,
          currentWeekResultsParams,
        ),
        staleTime: 2 * 60 * 1000,
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
  const updatePoolMutation = useUpdatePool({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
        queryClient.invalidateQueries({ queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId) });
      },
    },
  });

  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [showTbModal, setShowTbModal] = useState(false);
  const pendingPicksRef = useRef<Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>>([]);

  const welcomeKey = `pickem-welcome-dismissed-${poolId}-${user?.id ?? "guest"}`;
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try { return localStorage.getItem(welcomeKey) !== "1"; } catch { return false; }
  });
  function dismissWelcome() {
    try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
    setShowWelcome(false);
  }

  function doFinalSubmit(
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>,
    py?: number,
    ry?: number,
  ) {
    submitPicks.mutate(
      {
        poolId,
        data: {
          week: displayWeek,
          picks,
          ...(py != null && ry != null
            ? { tiebreakerPassingYards: py, tiebreakerRushingYards: ry }
            : {}),
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
  }

  function handleSubmit(force = false) {
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

    if (!force && picks.length < openGames.length) {
      setShowIncompleteWarning(true);
      return;
    }

    if (isWeek18) {
      pendingPicksRef.current = picks;
      setTbPassingYards("");
      setTbRushingYards("");
      setShowTbModal(true);
      return;
    }

    doFinalSubmit(picks);
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
  // "Locked" = all games in the current slate have passed their deadline,
  // OR at least one game has a graded result (defence against future-season IDs).
  const allGamesLocked =
    !!slate && slate.games.length > 0 && openGames.length === 0;
  const hasGradedResult = slate?.games.some((g) => g.userPickResult !== null) ?? false;
  const weekIsLocked = allGamesLocked || hasGradedResult;
  const hasAnySubmittedPick =
    slate?.games.some((g) => g.userPickTeamId !== null) ?? false;
  const entries = leaderboard?.entries ?? [];
  const actualPassingYards = leaderboard?.actualPassingYards ?? null;
  const actualRushingYards = leaderboard?.actualRushingYards ?? null;
  const tbActualsKnown = actualPassingYards !== null && actualRushingYards !== null;

  return (
    <>
      {/* Tiebreaker modal — Week 18 intercept */}
      <Dialog open={showTbModal} onOpenChange={(open) => { if (!open) setShowTbModal(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-yellow-400" />
              Tiebreaker Guess
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-snug">
              It&apos;s Week 18 — the final week of the season! In case of a tie, your tiebreaker guess decides the winner.{" "}
              Guess the <strong className="text-foreground">combined passing yards</strong> and{" "}
              <strong className="text-foreground">combined rushing yards</strong> for the last scheduled game of the week. Closest guess wins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Combined Passing Yards — Tiebreaker Game
              </label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 4200"
                value={tbPassingYards}
                onChange={(e) => setTbPassingYards(e.target.value)}
                className="text-lg font-mono h-12"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Combined Rushing Yards — Tiebreaker Game
              </label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 2100"
                value={tbRushingYards}
                onChange={(e) => setTbRushingYards(e.target.value)}
                className="text-lg font-mono h-12"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const py = parseInt(tbPassingYards, 10);
                    const ry = parseInt(tbRushingYards, 10);
                    if (!isNaN(py) && py >= 0 && !isNaN(ry) && ry >= 0) {
                      setShowTbModal(false);
                      doFinalSubmit(pendingPicksRef.current, py, ry);
                    }
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTbModal(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 font-bebas text-xl tracking-widest"
              disabled={submitPicks.isPending}
              onClick={() => {
                const py = parseInt(tbPassingYards, 10);
                const ry = parseInt(tbRushingYards, 10);
                if (isNaN(py) || py < 0 || isNaN(ry) || ry < 0) {
                  toast({
                    variant: "destructive",
                    title: "Enter valid guesses",
                    description: "Both fields are required and must be 0 or greater.",
                  });
                  return;
                }
                setShowTbModal(false);
                doFinalSubmit(pendingPicksRef.current, py, ry);
              }}
            >
              {submitPicks.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                "Submit Picks"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {/* Welcome banner — shown once per user per pool */}
              {showWelcome && (
                <div className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 pr-10">
                  <span className="text-xl leading-none mt-0.5">🏈</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground leading-snug">
                      Welcome to {poolName}!
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                      Pick the winner of every NFL game each week. Points accumulate all season — whoever has the most correct picks after Week 18 wins. Each game locks at kickoff. In Week 18, enter a passing and rushing yards tiebreaker to settle any ties. Good luck! 🦈🏈
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissWelcome}
                    className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                    aria-label="Dismiss welcome message"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

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
                </div>
              )}

              {/* Tiebreaker warning banner — Week 18 only, while games are open */}
              {isWeek18 && openGames.length > 0 && !weekIsLocked && (
                <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.08] px-4 py-3">
                  <Shuffle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-yellow-200 leading-snug">
                      Week 18 — tiebreaker required
                    </p>
                    <p className="text-xs text-yellow-400/70 mt-0.5 leading-snug">
                      When you submit your picks you&apos;ll be asked to guess combined passing yards + rushing yards for the last game of the week. The closest guess breaks any end-of-season tie.
                    </p>
                  </div>
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
                      <h3 className="font-bebas text-2xl tracking-wide leading-none flex items-center gap-2">
                        {weekIsLocked && (
                          <Lock className="w-5 h-5 text-yellow-400/80" />
                        )}
                        Week {slate.week}
                        {slate.week === slate.currentWeek && (
                          <span className="text-sm font-sans font-normal text-primary/50 tracking-normal">
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
                    <div className="flex items-center gap-2">
                      {slatesFetching && !slateLoading && (
                        <Wifi className="w-4 h-4 text-muted-foreground/40 animate-pulse" />
                      )}
                      {weekIsLocked && (
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-2.5 py-1">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Submitted + locked confirmation banner */}
                  {weekIsLocked && hasAnySubmittedPick && (
                    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3">
                      <Trophy className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-primary/90">
                          Picks submitted!
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Your picks are locked in for Week {slate.week}. Good luck!
                        </p>
                      </div>
                    </div>
                  )}

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
                      onPick={isActive && !weekIsLocked ? togglePick : () => {}}
                      forceReadOnly={weekIsLocked}
                    />
                  ))}

                  {/* Submit */}
                  {isActive && openGames.length > 0 && (
                    <div className="pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-t border-border/40">
                      <p className="text-sm text-muted-foreground">
                        {pendingPickCount > 0 ? (
                          <span className="text-yellow-400/80">
                            {pendingPickCount} game{pendingPickCount !== 1 ? "s" : ""} without a pick
                          </span>
                        ) : (
                          <span className="text-green-400/80 flex items-center gap-1">
                            <Check className="w-4 h-4" /> All open games picked
                          </span>
                        )}
                      </p>
                      <Button
                        onClick={() => handleSubmit()}
                        disabled={submitPicks.isPending || localPicks.size === 0}
                        className="font-bebas text-xl tracking-widest px-8 h-12"
                      >
                        {submitPicks.isPending ? (
                          <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                        ) : (
                          "Submit Picks"
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Incomplete-picks confirmation dialog */}
                  <AlertDialog
                    open={showIncompleteWarning}
                    onOpenChange={setShowIncompleteWarning}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Incomplete picks</AlertDialogTitle>
                        <AlertDialogDescription>
                          You&apos;ve only picked{" "}
                          <strong>
                            {openGames.length - pendingPickCount} of{" "}
                            {openGames.length}
                          </strong>{" "}
                          games this week. Submit anyway? Any unpicked games
                          won&apos;t count toward your score.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          Go back and finish picking
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setShowIncompleteWarning(false);
                            handleSubmit(true);
                          }}
                        >
                          Submit anyway
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Leaderboard ── */}
          <TabsContent
            value="leaderboard"
            className="m-0 focus-visible:outline-none"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bebas text-2xl tracking-wide">
                  Season Standings
                </h3>
                {!lbLoading && entries.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {entries.length} player{entries.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <PickEmSeasonLeaderboard
                poolId={poolId}
                entries={entries}
                currentWeek={currentWeek}
                currentUserId={user?.id ?? null}
                actualPassingYards={actualPassingYards}
                actualRushingYards={actualRushingYards}
                isLoading={lbLoading}
              />
            </div>
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
                poolId={poolId}
                entries={entries}
                currentWeek={currentWeek}
                currentUserId={user?.id ?? null}
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
                weekResults={currentWeekResults}
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

                {/* Sandbox tools — visible to super admins regardless of current sandboxMode */}
                {isSuperAdmin && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/[0.05] p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bebas text-2xl tracking-wide text-yellow-300 mb-0.5">
                          Sandbox Tools
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {sandboxMode
                            ? `Sandbox mode is active — Week ${sandboxWeek}. Super admin only.`
                            : "Sandbox mode is off. Enable to use hardcoded schedule + simulated scores."}
                        </p>
                      </div>
                      <Button
                        onClick={() =>
                          updatePoolMutation.mutate({ poolId, data: { sandboxMode: !sandboxMode } })
                        }
                        disabled={updatePoolMutation.isPending}
                        variant="outline"
                        size="sm"
                        className={
                          sandboxMode
                            ? "font-bebas tracking-wider border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 shrink-0"
                            : "font-bebas tracking-wider border-yellow-500/60 text-yellow-200 bg-yellow-500/10 hover:bg-yellow-500/20 shrink-0"
                        }
                      >
                        {updatePoolMutation.isPending ? (
                          <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                        ) : null}
                        {sandboxMode ? "Disable Sandbox" : "Enable Sandbox"}
                      </Button>
                    </div>
                    {sandboxMode && (
                      <>
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
                      </>
                    )}
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
