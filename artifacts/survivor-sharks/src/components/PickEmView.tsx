import React, { useState, useEffect } from "react";
import {
  useGetPickEmGames,
  useSubmitPickEmPicks,
  useGetPickEmLeaderboard,
  useProcessPickEmResults,
  getGetPickEmGamesQueryKey,
  getGetPickEmLeaderboardQueryKey,
} from "@workspace/api-client-react";
import type { PickEmGame } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Activity, ShieldAlert, Clock, Check, Trophy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PickEmViewProps {
  poolId: number;
  commissionerId: number;
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
        <img
          src={
            team.logoUrl ??
            `https://a.espncdn.com/i/teamlogos/mlb/500/${team.abbreviation.toLowerCase()}.png`
          }
          alt={team.name}
          className="w-10 h-10 sm:w-12 sm:h-12 object-contain drop-shadow-md"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span
          className={cn(
            "font-bebas tracking-wide text-sm sm:text-base leading-tight text-center",
            isPicked ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="sm:hidden">{team.abbreviation}</span>
          <span className="hidden sm:inline">{team.name}</span>
        </span>
        {isFinal && score != null && (
          <span
            className={cn(
              "font-bebas text-2xl leading-none",
              isPicked && isCorrect
                ? "text-green-400"
                : isPicked && isWrong
                  ? "text-destructive/70"
                  : "text-foreground/60",
            )}
          >
            {score}
          </span>
        )}
        {isLive && score != null && (
          <span className="font-bebas text-xl text-white leading-none">{score}</span>
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

export function PickEmView({ poolId, commissionerId }: PickEmViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCommissioner = commissionerId === user?.id || user?.role === "admin";

  const [localPicks, setLocalPicks] = useState<Map<string, string>>(new Map());
  const [initialized, setInitialized] = useState(false);

  const { data: slate, isLoading: gamesLoading } = useGetPickEmGames(poolId, {
    query: { queryKey: getGetPickEmGamesQueryKey(poolId), refetchInterval: 60000 },
  });

  const { data: leaderboard, isLoading: lbLoading } = useGetPickEmLeaderboard(poolId, {
    query: { queryKey: getGetPickEmLeaderboardQueryKey(poolId) },
  });

  const submitPicks = useSubmitPickEmPicks();
  const processResults = useProcessPickEmResults();

  useEffect(() => {
    if (slate?.games && !initialized) {
      const initial = new Map<string, string>();
      for (const game of slate.games) {
        if (game.userPickTeamId) {
          initial.set(game.id, game.userPickTeamId);
        }
      }
      setLocalPicks(initial);
      setInitialized(true);
    }
  }, [slate, initialized]);

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
          setInitialized(false);
          queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to save picks", description: "Please try again." });
        },
      },
    );
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
          setInitialized(false);
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bebas text-2xl text-foreground tracking-wide">{slate.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {slate.games.length} game{slate.games.length !== 1 ? "s" : ""} ·{" "}
                    {localPicks.size} pick{localPicks.size !== 1 ? "s" : ""} selected
                  </p>
                </div>
                {slate.deadlinePassed && (
                  <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-muted/20 text-muted-foreground/70 border-border/30">
                    Slate Locked
                  </span>
                )}
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
              <p className="font-bebas text-2xl tracking-wide">No picks yet this week</p>
              <p className="text-sm mt-1">Make picks to appear on the leaderboard.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bebas text-2xl tracking-wide text-foreground">
                  Week {leaderboard.week} Standings
                </h3>
                <span className="text-xs text-muted-foreground">
                  {leaderboard.entries.length} player{leaderboard.entries.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="rounded-xl border border-border/40 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/20">
                      <th className="text-left px-4 py-3 font-bebas text-base tracking-wide text-muted-foreground w-12">
                        #
                      </th>
                      <th className="text-left px-4 py-3 font-bebas text-base tracking-wide text-muted-foreground">
                        Player
                      </th>
                      <th className="text-right px-4 py-3 font-bebas text-base tracking-wide text-green-400/80">
                        Correct
                      </th>
                      <th className="text-right px-4 py-3 font-bebas text-base tracking-wide text-muted-foreground">
                        Picked
                      </th>
                      <th className="text-right px-4 py-3 font-bebas text-base tracking-wide text-primary/70 hidden sm:table-cell">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.entries.map((entry, idx) => {
                      const pct =
                        entry.total > 0
                          ? Math.round((entry.correct / entry.total) * 100)
                          : null;
                      const isMe = entry.userId === user?.id;
                      return (
                        <tr
                          key={entry.userId}
                          className={cn(
                            "border-b border-border/20 last:border-0 transition-colors",
                            isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/5",
                          )}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "font-bebas text-lg",
                                entry.rank === 1
                                  ? "text-yellow-400"
                                  : entry.rank === 2
                                    ? "text-zinc-300"
                                    : entry.rank === 3
                                      ? "text-amber-600"
                                      : "text-muted-foreground/50",
                              )}
                            >
                              {entry.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "font-medium",
                                isMe ? "text-primary" : "text-foreground",
                              )}
                            >
                              {entry.displayName ?? entry.username}
                              {isMe && (
                                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/60">
                                  you
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bebas text-xl text-green-400">{entry.correct}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bebas text-xl text-muted-foreground/70">
                              {entry.total}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            <span className="font-mono text-sm text-primary/60">
                              {pct != null ? `${pct}%` : "—"}
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
        </TabsContent>

        {/* ── Commissioner ── */}
        {isCommissioner && (
          <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
            <div className="max-w-lg space-y-6">
              <div>
                <h3 className="font-bebas text-2xl tracking-wide mb-1">Commissioner Tools</h3>
                <p className="text-sm text-muted-foreground">
                  Grade completed games and update the leaderboard for today's slate.
                </p>
              </div>

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
