import React, { useState, useEffect } from "react";
import {
  useGetPickEmGames,
  useSubmitPickEmPicks,
  useGetPickEmLeaderboard,
  useProcessPickEmResults,
  getGetPickEmGamesQueryKey,
  getGetPickEmLeaderboardQueryKey,
} from "@workspace/api-client-react";
import type { PickEmGame, PickEmSlate, PickEmLeaderboardGame, PickEmLeaderboardEntry, PickEmPlayerPick } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Activity, ShieldAlert, Clock, Check, X, Trophy, RefreshCw, Copy, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

function BaseDiamond({
  onFirst,
  onSecond,
  onThird,
  size = 26,
}: {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  size?: number;
}) {
  const c = size / 2;
  const d = size * 0.38;
  const r = size * 0.12;
  const top = { x: c, y: c - d };
  const right = { x: c + d, y: c };
  const bottom = { x: c, y: c + d };
  const left = { x: c - d, y: c };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon
        points={`${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.8"
      />
      <circle cx={bottom.x} cy={bottom.y} r={r * 0.65} fill="rgba(255,255,255,0.12)" />
      <circle
        cx={left.x} cy={left.y} r={r}
        fill={onThird ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onThird ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
      <circle
        cx={top.x} cy={top.y} r={r}
        fill={onSecond ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onSecond ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
      <circle
        cx={right.x} cy={right.y} r={r}
        fill={onFirst ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onFirst ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
    </svg>
  );
}

function OutDots({ outs }: { outs: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full border",
            i < outs
              ? "bg-red-400 border-red-500"
              : "bg-transparent border-white/25",
          )}
        />
      ))}
    </div>
  );
}

function pickRefetchInterval(data: PickEmSlate | undefined): number {
  if (!data || data.games.length === 0) return 5 * 60 * 1000;
  const hasLive = data.games.some((g) => g.status === "in_progress");
  if (hasLive) return 30 * 1000;
  const allFinal = data.games.every((g) => g.status === "final");
  if (allFinal) return 5 * 60 * 1000;
  return 60 * 1000;
}

interface PickEmViewProps {
  poolId: number;
  commissionerId: number;
  inviteCode: string;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

interface GameCardProps {
  game: PickEmGame;
  pickedTeamId: string | null;
  onPick: (teamId: string) => void;
}

function GameCard({ game, pickedTeamId, onPick }: GameCardProps) {
  const isLocked = game.deadlinePassed;
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";

  function teamBtn(
    team: PickEmGame["awayTeam"],
    side: "away" | "home",
    score: number | null | undefined,
  ) {
    const isPicked = pickedTeamId === team.id;
    const result = isPicked ? game.userPickResult : null;
    const isCorrect = result === "correct";
    const isWrong = result === "incorrect";

    return (
      <button
        key={team.id}
        type="button"
        disabled={isLocked}
        onClick={() => !isLocked && onPick(team.id)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all select-none",
          isLocked ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
          isPicked && !isCorrect && !isWrong
            ? "border-primary bg-primary/10 ring-2 ring-primary/40"
            : isPicked && isCorrect
              ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/40"
              : isPicked && isWrong
                ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
                : "border-border/40 bg-card/60 hover:border-border",
          side === "home" ? "items-end" : "items-start",
        )}
      >
        <div className="rounded-full bg-white/90 p-1.5 shadow-sm">
          <img
            src={
              team.logoUrl ??
              `https://a.espncdn.com/i/teamlogos/mlb/500/${team.abbreviation.toLowerCase()}.png`
            }
            alt={team.name}
            className="w-9 h-9 sm:w-10 sm:h-10 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <span
          className={cn(
            "font-bebas tracking-wide text-sm sm:text-base leading-tight text-center",
            isPicked ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="sm:hidden">{team.abbreviation}</span>
          <span className="hidden sm:inline">{team.name}</span>
        </span>
        {(isFinal || isLive) && score != null && (
          <span
            className={cn(
              "font-bebas text-2xl leading-none",
              isLive
                ? "text-white"
                : isPicked && isCorrect
                  ? "text-green-400"
                  : isPicked && isWrong
                    ? "text-destructive/70"
                    : "text-foreground/60",
            )}
          >
            {score}
          </span>
        )}
        {isPicked && (
          <div className="flex items-center gap-1 mt-0.5">
            {isCorrect ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-400 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Correct
              </span>
            ) : isWrong ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-destructive/80">
                ✗ Wrong
              </span>
            ) : (
              <Check className="w-3 h-3 text-primary" />
            )}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="shark-card rounded-xl border border-border/40 overflow-hidden">
      <div className="flex items-stretch gap-0">
        {teamBtn(game.awayTeam, "away", game.awayScore)}

        {/* Center divider */}
        <div className="flex flex-col items-center justify-center gap-1 px-3 min-w-[64px]">
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
              {game.liveBaseRunners && (
                <div className="flex flex-col items-center gap-0.5 mt-0.5">
                  <BaseDiamond
                    onFirst={game.liveBaseRunners.onFirst}
                    onSecond={game.liveBaseRunners.onSecond}
                    onThird={game.liveBaseRunners.onThird}
                  />
                  {game.liveOuts != null && <OutDots outs={game.liveOuts} />}
                </div>
              )}
            </>
          ) : isFinal ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
              Final
            </span>
          ) : (
            <>
              <span className="font-bebas text-[10px] text-muted-foreground/50 tracking-widest uppercase">
                vs
              </span>
              <div className="flex items-center gap-0.5 mt-0.5">
                <Clock className="w-2.5 h-2.5 text-primary/50 shrink-0" />
                <span className="text-[9px] text-muted-foreground/60 leading-tight font-medium whitespace-nowrap">
                  {formatTime(game.startTime)}
                </span>
              </div>
            </>
          )}
        </div>

        {teamBtn(game.homeTeam, "home", game.homeScore)}
      </div>
    </div>
  );
}

// ── Picks Grid (leaderboard with per-player per-game picks) ──────────────────

interface PicksGridProps {
  games: PickEmLeaderboardGame[];
  entries: PickEmLeaderboardEntry[];
  currentUserId: number | null;
  week: number;
}

function gameStatusLabel(status: string): string {
  if (status === "in_progress") return "LIVE";
  if (status === "final") return "Final";
  return "";
}

function PicksGrid({ games, entries, currentUserId, week }: PicksGridProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas text-2xl tracking-wide text-foreground">
          Week {week} Standings
        </h3>
        <span className="text-xs text-muted-foreground">
          {entries.length} player{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Scrollable picks grid */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: `${Math.max(400, 220 + games.length * 72)}px` }}>
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {/* Sticky player column header */}
                <th className="sticky left-0 z-10 bg-muted/20 text-left px-3 py-2.5 font-bebas text-base tracking-wide text-muted-foreground min-w-[160px] border-r border-border/30">
                  Player
                </th>
                {/* Game column headers */}
                {games.map((game) => {
                  const statusLabel = gameStatusLabel(game.status);
                  return (
                    <th key={game.id} className="px-1 py-2 text-center font-normal w-[68px]">
                      <div className="flex flex-col items-center gap-0.5">
                        {/* Away */}
                        <div className="flex items-center gap-1">
                          {game.awayTeam.logoUrl && (
                            <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                              <img src={game.awayTeam.logoUrl} alt={game.awayTeam.abbreviation} className="w-3.5 h-3.5 object-contain" />
                            </div>
                          )}
                          <span className="font-bebas text-[11px] tracking-wide text-muted-foreground/70">
                            {game.awayTeam.abbreviation}
                          </span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/40 leading-none">@</span>
                        {/* Home */}
                        <div className="flex items-center gap-1">
                          {game.homeTeam.logoUrl && (
                            <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                              <img src={game.homeTeam.logoUrl} alt={game.homeTeam.abbreviation} className="w-3.5 h-3.5 object-contain" />
                            </div>
                          )}
                          <span className="font-bebas text-[11px] tracking-wide text-muted-foreground/70">
                            {game.homeTeam.abbreviation}
                          </span>
                        </div>
                        {/* Status badge */}
                        {statusLabel && (
                          <span className={cn(
                            "text-[8px] font-bold uppercase tracking-widest px-1 py-0.5 rounded leading-none mt-0.5",
                            game.status === "in_progress"
                              ? "bg-red-500/20 text-red-400 animate-pulse"
                              : "bg-muted/30 text-muted-foreground/50",
                          )}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                {/* Score header */}
                <th className="px-3 py-2.5 text-right font-bebas text-base tracking-wide text-muted-foreground min-w-[72px]">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const isMe = entry.userId === currentUserId;
                const pickMap = new Map(entry.picks.map((p) => [p.gameId, p]));
                const pct = entry.picked > 0
                  ? Math.round((entry.correct / entry.picked) * 100)
                  : null;

                return (
                  <tr
                    key={entry.userId}
                    className={cn(
                      "border-b border-border/20 last:border-0",
                      isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                    )}
                  >
                    {/* Sticky player info */}
                    <td className={cn(
                      "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30",
                      isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-card" : "bg-card",
                    )}>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-bebas text-base w-5 shrink-0",
                          entry.rank === 1 ? "text-yellow-400"
                          : entry.rank === 2 ? "text-zinc-300"
                          : entry.rank === 3 ? "text-amber-600"
                          : "text-muted-foreground/40",
                        )}>
                          {entry.rank}
                        </span>
                        <span className={cn("font-medium text-sm truncate max-w-[110px]", isMe ? "text-primary" : "text-foreground")}>
                          {entry.displayName ?? entry.username}
                          {isMe && (
                            <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Per-game pick cells */}
                    {games.map((game) => {
                      const pick = pickMap.get(game.id);
                      if (!pick) {
                        return (
                          <td key={game.id} className="px-1 py-2 text-center">
                            <span className="text-muted-foreground/20 text-xs">—</span>
                          </td>
                        );
                      }

                      const isAway = pick.pickedTeamId === game.awayTeam.id;
                      const team = isAway ? game.awayTeam : game.homeTeam;

                      return (
                        <td key={game.id} className="px-1 py-2 text-center">
                          <div className={cn(
                            "inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 border text-center min-w-[52px]",
                            pick.result === "correct"
                              ? "border-green-500/40 bg-green-500/10"
                              : pick.result === "incorrect"
                              ? "border-red-500/40 bg-red-500/10"
                              : "border-border/30 bg-muted/10",
                          )}>
                            {team.logoUrl && (
                              <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                                <img src={team.logoUrl} alt={team.abbreviation} className="w-4 h-4 object-contain" />
                              </div>
                            )}
                            <span className={cn(
                              "font-bebas text-[11px] tracking-wide leading-none",
                              pick.result === "correct" ? "text-green-400"
                              : pick.result === "incorrect" ? "text-red-400"
                              : "text-muted-foreground/70",
                            )}>
                              {team.abbreviation}
                            </span>
                            {pick.result === "correct" && (
                              <Check className="w-2.5 h-2.5 text-green-400" />
                            )}
                            {pick.result === "incorrect" && (
                              <X className="w-2.5 h-2.5 text-red-400" />
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Score summary */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <span className="font-bebas text-lg text-green-400">{entry.correct}</span>
                      <span className="font-bebas text-lg text-muted-foreground/40">/{entry.picked}</span>
                      {pct !== null && (
                        <span className="ml-1.5 font-mono text-[10px] text-primary/50">{pct}%</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/40 text-center">
        Scroll right to see all games · Results update automatically
      </p>
    </div>
  );
}

export function PickEmView({ poolId, commissionerId, inviteCode }: PickEmViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCommissioner = commissionerId === user?.id || user?.role === "admin";

  const [localPicks, setLocalPicks] = useState<Map<string, string>>(new Map());

  const {
    data: slate,
    isLoading: gamesLoading,
    isFetching: gamesFetching,
  } = useGetPickEmGames(poolId, {
    query: {
      queryKey: getGetPickEmGamesQueryKey(poolId),
      refetchInterval: (query) => pickRefetchInterval(query.state.data),
    },
  });

  const { data: leaderboard, isLoading: lbLoading } = useGetPickEmLeaderboard(poolId, {
    query: {
      queryKey: getGetPickEmLeaderboardQueryKey(poolId),
      refetchInterval: (query) => pickRefetchInterval(slate),
    },
  });

  const submitPicks = useSubmitPickEmPicks();
  const processResults = useProcessPickEmResults();

  useEffect(() => {
    if (!slate?.games) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const game of slate.games) {
        if (game.userPickTeamId && !next.has(game.id)) {
          next.set(game.id, game.userPickTeamId);
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

  function handleSubmit() {
    if (!slate) return;

    const picks = Array.from(localPicks.entries())
      .map(([gameId, teamId]) => {
        const game = slate.games.find((g) => g.id === gameId);
        if (!game || game.deadlinePassed) return null;
        const team = teamId === game.awayTeam.id ? game.awayTeam : game.homeTeam;
        return { gameId, pickedTeamId: teamId, pickedTeamName: team.name };
      })
      .filter(Boolean) as Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;

    if (picks.length === 0) {
      toast({
        title: "No open picks to submit",
        description: "All games may have already started.",
      });
      return;
    }

    submitPicks.mutate(
      { poolId, data: { picks } },
      {
        onSuccess: (result) => {
          toast({
            title: "Picks saved!",
            description: `${result.saved} pick${result.saved !== 1 ? "s" : ""} saved.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to save picks", description: "Please try again." });
        },
      },
    );
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteCode);
    toast({ title: "Invite code copied to clipboard!" });
  }

  function handleProcessResults() {
    processResults.mutate(
      { poolId },
      {
        onSuccess: (result) => {
          toast({
            title: "Results processed",
            description: `${result.processed} pick${result.processed !== 1 ? "s" : ""} graded.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetPickEmLeaderboardQueryKey(poolId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to process results" });
        },
      },
    );
  }

  const openGames = slate?.games.filter((g) => !g.deadlinePassed) ?? [];
  const lockedGames = slate?.games.filter((g) => g.deadlinePassed) ?? [];
  const pendingPickCount = openGames.filter((g) => !localPicks.has(g.id)).length;

  return (
    <Tabs defaultValue="picks" className="w-full">
      <TabsList className="bg-card border border-border flex flex-wrap h-auto p-1.5 gap-1 shadow-sm">
        <TabsTrigger
          value="picks"
          className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
        >
          <Target className="w-5 h-5" /> Today's Picks
        </TabsTrigger>
        <TabsTrigger
          value="leaderboard"
          className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2"
        >
          <Activity className="w-5 h-5" /> Leaderboard
        </TabsTrigger>
        {isCommissioner && (
          <TabsTrigger
            value="commissioner"
            className="font-bebas text-xl tracking-wider px-5 py-2.5 text-muted-foreground hover:text-foreground ml-auto flex gap-2"
          >
            <ShieldAlert className="w-5 h-5" /> Commissioner
          </TabsTrigger>
        )}
      </TabsList>

      <div className="mt-8">
        {/* ── Today's Picks ── */}
        <TabsContent value="picks" className="m-0 focus-visible:outline-none">
          {gamesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : !slate || slate.games.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bebas text-2xl tracking-wide">No games today</p>
              <p className="text-sm mt-1">Check back when the schedule is posted.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Date header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bebas text-2xl text-foreground tracking-wide">{slate.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {slate.games.length} game{slate.games.length !== 1 ? "s" : ""} ·{" "}
                    {localPicks.size} pick{localPicks.size !== 1 ? "s" : ""} selected
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Live-update status badge */}
                  {slate.games.some((g) => g.status === "in_progress") ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-red-500/10 text-red-400 border-red-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                      Live · updates every 30s
                    </span>
                  ) : !slate.games.every((g) => g.status === "final") && slate.deadlinePassed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-primary/10 text-primary/70 border-primary/20">
                      {gamesFetching ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Wifi className="w-2.5 h-2.5" />
                      )}
                      Auto-updates every min
                    </span>
                  ) : null}
                  {slate.deadlinePassed && (
                    <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-muted/20 text-muted-foreground/70 border-border/30">
                      Slate Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Open games */}
              {openGames.length > 0 && (
                <div className="space-y-3">
                  {openGames.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      pickedTeamId={localPicks.get(game.id) ?? null}
                      onPick={(teamId) => togglePick(game.id, teamId)}
                    />
                  ))}
                </div>
              )}

              {/* Locked / in-progress / final games */}
              {lockedGames.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 border-t border-border/30 pt-4">
                    In Progress / Final
                  </p>
                  {lockedGames.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      pickedTeamId={localPicks.get(game.id) ?? game.userPickTeamId ?? null}
                      onPick={() => {}}
                    />
                  ))}
                </div>
              )}

              {/* Submit button */}
              {openGames.length > 0 && (
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
                    onClick={handleSubmit}
                    disabled={submitPicks.isPending || localPicks.size === 0}
                    className="font-bebas text-xl tracking-widest px-8 h-12"
                  >
                    {submitPicks.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…
                      </>
                    ) : (
                      "Submit Picks"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Leaderboard ── */}
        <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
          {lbLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : !leaderboard || leaderboard.entries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bebas text-2xl tracking-wide">No picks yet today</p>
              <p className="text-sm mt-1">Make picks to appear on the leaderboard.</p>
            </div>
          ) : (
            <PicksGrid
              games={leaderboard.games}
              entries={leaderboard.entries}
              currentUserId={user?.id ?? null}
              week={leaderboard.week}
            />
          )}
        </TabsContent>

        {/* ── Commissioner ── */}
        {isCommissioner && (
          <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
            <div className="max-w-lg space-y-6">
              <div>
                <h3 className="font-bebas text-2xl tracking-wide mb-1">Commissioner Tools</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your pool and grade completed games.
                </p>
              </div>

              {/* Invite Code */}
              <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
                <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">Invite Code</h4>
                    <p className="text-sm text-muted-foreground">Share this code to let players join the pool.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
                      {inviteCode}
                    </div>
                    <Button
                      size="lg"
                      onClick={copyInvite}
                      className="font-bebas text-xl tracking-wider"
                    >
                      <Copy className="w-5 h-5 mr-2" /> Copy Code
                    </Button>
                  </div>
                </div>
              </div>

              {/* Process Results */}
              <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
                <div>
                  <h4 className="font-bebas text-xl tracking-wide text-foreground mb-1">
                    Process Today's Results
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Fetches final scores from ESPN and marks each pick as correct or incorrect. Safe
                    to run multiple times — only final games are graded.
                  </p>
                </div>
                <Button
                  onClick={handleProcessResults}
                  disabled={processResults.isPending}
                  variant="outline"
                  className="font-bebas text-lg tracking-widest"
                >
                  {processResults.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing…
                    </>
                  ) : (
                    "Process Results"
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
