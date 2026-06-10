import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetNflPickEmSeasonGames,
  useSubmitNflPickEmSeasonPicks,
  useGetNflPickEmSeasonLeaderboard,
  useProcessNflPickEmSeasonResults,
  useGetNflPickEmSeasonWeekResults,
  getGetNflPickEmSeasonGamesQueryKey,
  getGetNflPickEmSeasonLeaderboardQueryKey,
  getGetNflPickEmSeasonWeekResultsQueryKey,
  type NflPickEmSeasonGame,
  type NflPickEmSeasonWeekResults,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Target,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  RefreshCw,
  Check,
  X,
  Copy,
} from "lucide-react";

const NFL_TOTAL_WEEKS = 18;

interface PickEmSeasonViewProps {
  poolId: number;
  poolName: string;
  commissionerId: number;
  currentWeek: number;
  inviteCode: string;
}

function formatGameTime(isoString: string): string {
  const date = new Date(isoString);
  return (
    date.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" }) +
    " " +
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      hour12: true,
    })
  );
}

function GameCard({
  game,
  pickedTeamId,
  onPick,
  pending,
}: {
  game: NflPickEmSeasonGame;
  pickedTeamId: string | null;
  onPick: (teamId: string, teamName: string) => void;
  pending?: boolean;
}) {
  const locked = game.deadlinePassed;
  const result = game.userPickResult ?? null;
  const hasScore = game.awayScore != null && game.homeScore != null;
  const isLive = game.status === "in_progress";
  const isPost = game.status === "final";

  function teamButton(
    team: { id: string; name: string; abbreviation: string; logoUrl?: string | null },
    score: number | null | undefined,
    record: string | null | undefined,
  ) {
    const isPicked = pickedTeamId === team.id;
    const isCorrect = isPicked && result === "correct";
    const isWrong = isPicked && result === "incorrect";
    const isLoser =
      !isPicked &&
      isPost &&
      hasScore &&
      (team.id === game.awayTeam.id
        ? (game.awayScore ?? 0) < (game.homeScore ?? 0)
        : (game.homeScore ?? 0) < (game.awayScore ?? 0));

    return (
      <button
        type="button"
        disabled={locked || pending}
        onClick={() => !locked && onPick(team.id, team.name)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all min-w-0",
          !locked && !pending && "cursor-pointer hover:border-primary/50 hover:bg-primary/5",
          (locked || pending) && "cursor-default",
          isPicked && !isCorrect && !isWrong && "border-primary/60 bg-primary/10",
          isCorrect && "border-green-500/60 bg-green-500/10",
          isWrong && "border-destructive/60 bg-destructive/10",
          !isPicked && !isLoser && !locked && "border-border/40 bg-card/30",
          !isPicked && !isLoser && locked && "border-border/30 bg-card/20 opacity-60",
          isLoser && "border-border/20 bg-card/10 opacity-40",
        )}
      >
        {team.logoUrl && (
          <img
            src={team.logoUrl}
            alt={team.abbreviation}
            className="w-10 h-10 object-contain"
          />
        )}
        <span
          className={cn(
            "font-bebas text-lg tracking-wider leading-none",
            isPicked ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {team.abbreviation}
        </span>
        {record && (
          <span className="text-[10px] text-muted-foreground/50 leading-none">{record}</span>
        )}
        {hasScore && score != null && (
          <span
            className={cn(
              "font-bebas text-2xl leading-none mt-0.5",
              isPost ? "text-foreground" : "text-primary/80",
            )}
          >
            {score}
          </span>
        )}
        {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />}
        {isWrong && <XCircle className="w-4 h-4 text-destructive/70 mt-0.5" />}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        result === "correct"
          ? "border-green-500/20 bg-green-500/5"
          : result === "incorrect"
            ? "border-destructive/20 bg-destructive/5"
            : "border-border/40 bg-card/50",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-muted-foreground/60 font-medium uppercase tracking-wide">
          {isLive ? "🔴 Live" : isPost ? "Final" : formatGameTime(game.startTime)}
        </span>
        <div className="flex items-center gap-2">
          {game.liveDetail && (
            <span className="text-[11px] text-primary/60">{game.liveDetail}</span>
          )}
          {locked && !isPost && !isLive && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <Clock className="w-3 h-3" /> Locked
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        {teamButton(game.awayTeam, game.awayScore, game.awayRecord)}
        <div className="flex flex-col items-center justify-center gap-1 shrink-0 w-5">
          <span className="text-xs text-muted-foreground/30 font-semibold">@</span>
          {!pickedTeamId && !locked && (
            <span className="text-[9px] text-muted-foreground/25 uppercase tracking-wide">Pick</span>
          )}
        </div>
        {teamButton(game.homeTeam, game.homeScore, game.homeRecord)}
      </div>
    </div>
  );
}

function WeekPicksTable({
  data,
  currentUserId,
}: {
  data: NflPickEmSeasonWeekResults;
  currentUserId: number;
}) {
  const { games, players } = data;

  const teamAbbrMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of games) {
      m.set(g.awayTeam.id, g.awayTeam.abbreviation);
      m.set(g.homeTeam.id, g.homeTeam.abbreviation);
    }
    return m;
  }, [games]);

  const minWidth = Math.max(400, 220 + games.length * 76);

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Trophy className="w-9 h-9 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">No picks recorded for this week.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm border-separate border-spacing-0"
          style={{ minWidth: `${minWidth}px` }}
        >
          <thead>
            <tr className="bg-muted/[0.05]">
              <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-bebas text-xs tracking-wider text-muted-foreground/40">
                Player
              </th>
              {games.map((game) => (
                <th
                  key={game.id}
                  className="px-1 py-2 text-center border-b border-border/30 font-mono text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap"
                  style={{ width: 76 }}
                >
                  <div>{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                  {game.awayScore != null && game.homeScore != null && (
                    <div className="text-[9px] text-muted-foreground/35 font-normal mt-0.5">
                      {game.awayScore}–{game.homeScore}
                    </div>
                  )}
                </th>
              ))}
              <th className="px-3 py-2 text-right border-b border-border/30 font-bebas text-xs text-muted-foreground/40 whitespace-nowrap">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, idx) => {
              const isMe = player.userId === currentUserId;
              const pickMap = new Map(player.picks.map((p) => [p.gameId, p]));
              return (
                <tr
                  key={player.userId}
                  className={cn(
                    idx < players.length - 1 && "[&>td]:border-b-2 [&>td]:border-white/20",
                    isMe
                      ? "bg-primary/5"
                      : idx % 2 === 0
                      ? "bg-transparent"
                      : "bg-muted/[0.03]",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30 bg-card",
                      isMe && "ring-inset ring-1 ring-primary/20",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {player.rank === 1 ? (
                        <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      ) : (
                        <span
                          className={cn(
                            "font-bebas text-sm w-[14px] text-center shrink-0",
                            player.rank === 2
                              ? "text-zinc-300"
                              : player.rank === 3
                              ? "text-amber-600"
                              : "text-muted-foreground/35",
                          )}
                        >
                          {player.rank}
                        </span>
                      )}
                      <span
                        className={cn(
                          "font-medium text-sm truncate max-w-[120px]",
                          isMe ? "text-primary" : "text-foreground",
                        )}
                      >
                        {player.displayName || player.username}
                      </span>
                      {isMe && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-primary/50 shrink-0">
                          you
                        </span>
                      )}
                    </div>
                  </td>

                  {games.map((game) => {
                    const pick = pickMap.get(game.id);
                    if (!pick) {
                      return (
                        <td key={game.id} className="px-1 py-2.5 text-center">
                          <span className="text-muted-foreground/25 text-xs">—</span>
                        </td>
                      );
                    }
                    const isCorrect = pick.result === "correct";
                    const isWrong = pick.result === "incorrect";
                    const abbr =
                      teamAbbrMap.get(pick.pickedTeamId) ?? pick.pickedTeamName.slice(0, 4);
                    return (
                      <td key={game.id} className="px-1 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold font-mono tracking-wide",
                            isCorrect &&
                              "bg-green-500/10 text-green-400 border border-green-500/25",
                            isWrong &&
                              "bg-red-500/10 text-red-400 border border-red-500/25",
                            !isCorrect &&
                              !isWrong &&
                              "bg-muted/10 text-muted-foreground/50 border border-border/20",
                          )}
                        >
                          {isCorrect && <Check className="w-2.5 h-2.5" />}
                          {isWrong && <X className="w-2.5 h-2.5" />}
                          {abbr}
                        </span>
                      </td>
                    );
                  })}

                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className="font-bebas text-base text-foreground">{player.correct}</span>
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
  );
}

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
  currentUserId: number;
}) {
  const params = useMemo(() => ({ week }), [week]);
  const { data, isLoading } = useGetNflPickEmSeasonWeekResults(poolId, params, {
    query: {
      queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, params),
      enabled: open,
      staleTime: 5 * 60 * 1000,
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[min(95vw,960px)] p-0 gap-0 flex flex-col overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Week {week} · Results
          </DialogTitle>
          {data && (
            <DialogDescription>
              {data.players.length} player{data.players.length !== 1 ? "s" : ""} ·{" "}
              {data.games.length} game{data.games.length !== 1 ? "s" : ""}
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
          ) : !data ? null : (
            <WeekPicksTable data={data} currentUserId={currentUserId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PickEmSeasonView({
  poolId,
  poolName: _poolName,
  commissionerId,
  currentWeek,
  inviteCode,
}: PickEmSeasonViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCommissioner = user?.id === commissionerId || user?.role === "admin";

  const [displayWeek, setDisplayWeek] = useState(currentWeek);
  const [resultsModalWeek, setResultsModalWeek] = useState<number | null>(null);
  const [localPicks, setLocalPicks] = useState<
    Map<string, { pickedTeamId: string; pickedTeamName: string }>
  >(new Map());
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const { data: slate, isLoading: slateLoading } = useGetNflPickEmSeasonGames(
    poolId,
    { week: displayWeek },
    {
      query: {
        queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, { week: displayWeek }),
        refetchInterval: 30_000,
      },
    },
  );

  const { data: leaderboard, isLoading: lbLoading } = useGetNflPickEmSeasonLeaderboard(poolId, {
    query: {
      queryKey: getGetNflPickEmSeasonLeaderboardQueryKey(poolId),
      refetchInterval: 60_000,
    },
  });

  const prevWeek = currentWeek > 1 ? currentWeek - 1 : null;
  const prevWeekParams = useMemo(() => ({ week: prevWeek ?? 1 }), [prevWeek]);
  const { data: prevWeekResults } = useGetNflPickEmSeasonWeekResults(
    poolId,
    prevWeekParams,
    {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, prevWeekParams),
        enabled: prevWeek != null && displayWeek === currentWeek,
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  const weekGridParams = useMemo(() => ({ week: displayWeek }), [displayWeek]);
  const { data: weekGridData, isLoading: weekGridLoading } = useGetNflPickEmSeasonWeekResults(
    poolId,
    weekGridParams,
    {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, weekGridParams),
        refetchInterval: 30_000,
      },
    },
  );

  const submitPicks = useSubmitNflPickEmSeasonPicks();
  const processResults = useProcessNflPickEmSeasonResults();

  useEffect(() => {
    if (!slate?.games) return;
    const map = new Map<string, { pickedTeamId: string; pickedTeamName: string }>();
    for (const game of slate.games) {
      if (game.userPickTeamId) {
        const team =
          game.awayTeam.id === game.userPickTeamId ? game.awayTeam : game.homeTeam;
        map.set(game.id, { pickedTeamId: game.userPickTeamId, pickedTeamName: team.name });
      }
    }
    setLocalPicks(map);
    setHasPendingChanges(false);
  }, [slate, displayWeek]);

  function handlePick(gameId: string, teamId: string, teamName: string) {
    setLocalPicks((prev) => {
      const next = new Map(prev);
      next.set(gameId, { pickedTeamId: teamId, pickedTeamName: teamName });
      return next;
    });
    setHasPendingChanges(true);
  }

  function handleSubmit() {
    if (!slate) return;
    const unlockedPicks = Array.from(localPicks.entries())
      .filter(([gameId]) => {
        const game = slate.games.find((g) => g.id === gameId);
        return game && !game.deadlinePassed;
      })
      .map(([gameId, pick]) => ({
        gameId,
        pickedTeamId: pick.pickedTeamId,
        pickedTeamName: pick.pickedTeamName,
      }));

    if (unlockedPicks.length === 0) {
      toast({ title: "No changes to save", description: "All picked games are already locked." });
      return;
    }

    submitPicks.mutate(
      { poolId, data: { week: displayWeek, picks: unlockedPicks } },
      {
        onSuccess: (result) => {
          toast({
            title: "Picks saved!",
            description: `Saved ${result.saved} pick${result.saved !== 1 ? "s" : ""} for Week ${displayWeek}.`,
          });
          setHasPendingChanges(false);
          queryClient.invalidateQueries({
            queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, { week: displayWeek }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetNflPickEmSeasonLeaderboardQueryKey(poolId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, weekGridParams),
          });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Failed to save picks",
            description: err?.data?.error ?? err?.message ?? "Please try again.",
          });
        },
      },
    );
  }

  function handleProcessResults() {
    processResults.mutate(
      { poolId, data: { week: displayWeek } },
      {
        onSuccess: (result) => {
          toast({
            title: "Results graded",
            description: `Graded ${result.graded} picks for Week ${displayWeek}.`,
          });
          queryClient.invalidateQueries({
            queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, { week: displayWeek }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetNflPickEmSeasonLeaderboardQueryKey(poolId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, weekGridParams),
          });
          if (prevWeek != null) {
            queryClient.invalidateQueries({
              queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(poolId, prevWeekParams),
            });
          }
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Processing failed",
            description: err?.data?.error ?? err?.message ?? "Unknown error",
          });
        },
      },
    );
  }

  const unlockedGames = slate?.games.filter((g) => !g.deadlinePassed) ?? [];
  const pickedUnlocked = unlockedGames.filter((g) => localPicks.has(g.id));
  const allUnlockedPicked =
    unlockedGames.length > 0 && pickedUnlocked.length === unlockedGames.length;

  const myEntry = leaderboard?.entries.find((e) => e.userId === user?.id);
  const myWeeklyScore = myEntry?.weeklyScores?.[String(displayWeek)];

  const showPrevWinnerBanner =
    prevWeek != null &&
    displayWeek === currentWeek &&
    prevWeekResults?.hasResults === true &&
    (prevWeekResults?.winners?.length ?? 0) > 0;

  return (
    <>
      {resultsModalWeek != null && (
        <WeekResultsModal
          open={true}
          onClose={() => setResultsModalWeek(null)}
          poolId={poolId}
          week={resultsModalWeek}
          currentUserId={user?.id ?? 0}
        />
      )}

      <div className="space-y-6">
        {/* ── Week navigator ── */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDisplayWeek((w) => Math.max(1, w - 1))}
            disabled={displayWeek === 1}
            className="h-9 w-9 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex gap-1 min-w-max">
              {Array.from({ length: NFL_TOTAL_WEEKS }, (_, i) => i + 1).map((week) => {
                const weekScore = myEntry?.weeklyScores?.[String(week)];
                const isCurrent = week === currentWeek;
                const isSelected = week === displayWeek;
                return (
                  <button
                    key={week}
                    onClick={() => setDisplayWeek(week)}
                    className={cn(
                      "flex flex-col items-center justify-center w-10 h-12 rounded-lg text-xs font-bold transition-all shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(30,144,255,0.4)]"
                        : isCurrent
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : weekScore
                            ? "bg-card border border-border/50 text-foreground"
                            : "bg-card/30 border border-border/20 text-muted-foreground/50",
                    )}
                  >
                    <span className="font-bebas text-base leading-none">{week}</span>
                    {weekScore && (
                      <span
                        className={cn(
                          "text-[9px] leading-none mt-0.5 tabular-nums",
                          isSelected ? "text-primary-foreground/70" : "text-green-400/80",
                        )}
                      >
                        {weekScore.correct}/{weekScore.total}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDisplayWeek((w) => Math.min(NFL_TOTAL_WEEKS, w + 1))}
            disabled={displayWeek === NFL_TOTAL_WEEKS}
            className="h-9 w-9 shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="picks">
          <TabsList className="bg-card border border-border flex flex-wrap h-auto p-1.5 gap-1 shadow-sm">
            <TabsTrigger
              value="picks"
              className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2 items-center"
            >
              <Target className="w-5 h-5" /> Week {displayWeek}
              {myWeeklyScore != null && (
                <Badge
                  variant="outline"
                  className="font-mono text-xs ml-1 text-green-400 border-green-500/30"
                >
                  {myWeeklyScore.correct}/{myWeeklyScore.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="leaderboard"
              className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2 items-center"
            >
              <Trophy className="w-5 h-5" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2 items-center"
            >
              <LayoutGrid className="w-5 h-5" /> Weekly Grid
            </TabsTrigger>
            {isCommissioner && (
              <TabsTrigger
                value="commissioner"
                className="font-bebas text-xl tracking-wider px-5 py-2.5 text-muted-foreground hover:text-foreground ml-auto flex gap-2 items-center"
              >
                <ShieldAlert className="w-5 h-5" /> Commissioner
              </TabsTrigger>
            )}
          </TabsList>

          {/* ─ Picks tab ─ */}
          <TabsContent value="picks" className="m-0 mt-6 focus-visible:outline-none">
            {slateLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : !slate?.games.length ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="font-bebas text-2xl tracking-wide mb-2">No games scheduled</p>
                <p className="text-sm">Week {displayWeek} schedule hasn't been posted yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* ── Previous week winner banner ── */}
                {showPrevWinnerBanner && prevWeekResults && (
                  <div className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3">
                    <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-yellow-200">
                        Week {prevWeek} Winner{prevWeekResults.winners.length > 1 ? "s" : ""}:
                      </span>
                      <span className="text-sm text-yellow-300">
                        {prevWeekResults.winners
                          .map((w) => w.displayName || w.username)
                          .join(" & ")}
                      </span>
                      <span className="text-yellow-500/50 text-xs">·</span>
                      <span className="text-sm text-yellow-400/70">
                        {prevWeekResults.winners[0].correct}/{prevWeekResults.winners[0].total}{" "}
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

                {/* ── Save picks bar ── */}
                {unlockedGames.length > 0 && (
                  <div className="flex items-center justify-between bg-card/50 border border-border/30 rounded-lg px-4 py-2.5">
                    <span className="text-sm text-muted-foreground">
                      Picks:{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          allUnlockedPicked ? "text-green-400" : "text-foreground",
                        )}
                      >
                        {pickedUnlocked.length} / {unlockedGames.length}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!hasPendingChanges || submitPicks.isPending}
                      className="h-8 font-bebas tracking-wide text-base"
                    >
                      {submitPicks.isPending ? "Saving…" : "Save Picks"}
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {slate.games.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      pickedTeamId={localPicks.get(game.id)?.pickedTeamId ?? null}
                      onPick={(teamId, teamName) => handlePick(game.id, teamId, teamName)}
                      pending={submitPicks.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─ Leaderboard tab ─ */}
          <TabsContent value="leaderboard" className="m-0 mt-6 focus-visible:outline-none">
            {lbLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : !leaderboard?.entries.length ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-bebas text-2xl tracking-wide">No picks yet</p>
                <p className="text-sm mt-1">Make picks for Week {displayWeek} to appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-x-4 items-center px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  <span>#</span>
                  <span>Player</span>
                  <span className="text-right">Wk {displayWeek}</span>
                  <span className="text-right">Season</span>
                </div>

                {leaderboard.entries.map((entry, i) => {
                  const weekScore = entry.weeklyScores?.[String(displayWeek)];
                  const isMe = entry.userId === user?.id;
                  const prevEntry = i > 0 ? leaderboard.entries[i - 1] : null;
                  const isTied = prevEntry?.seasonCorrect === entry.seasonCorrect;

                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "grid grid-cols-[2rem_1fr_auto_auto] gap-x-4 items-center rounded-lg border px-3 py-3 transition-all",
                        isMe
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/30 bg-card/40",
                      )}
                    >
                      <span
                        className={cn(
                          "font-bebas text-xl leading-none text-center",
                          entry.rank === 1
                            ? "text-yellow-400"
                            : entry.rank === 2
                              ? "text-slate-300"
                              : entry.rank === 3
                                ? "text-orange-400/80"
                                : "text-muted-foreground/60",
                        )}
                      >
                        {entry.rank}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "font-semibold text-sm truncate",
                              isMe ? "text-primary" : "text-foreground",
                            )}
                          >
                            {entry.displayName || entry.username}
                            {isMe && (
                              <span className="ml-1 text-primary/50 font-normal text-xs">
                                (you)
                              </span>
                            )}
                          </span>
                          {isTied && entry.tiebreakerPrediction != null && (
                            <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0">
                              TB:{entry.tiebreakerPrediction}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {weekScore != null ? (
                          <div>
                            <span className="font-bebas text-lg text-foreground">
                              {weekScore.correct}
                            </span>
                            <span className="text-xs text-muted-foreground/50">
                              /{weekScore.total}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-sm">—</span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="font-bebas text-xl text-accent">
                          {entry.seasonCorrect}
                        </span>
                        <span className="text-xs text-muted-foreground/50">
                          /{entry.seasonTotal}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─ Weekly Grid tab ─ */}
          <TabsContent value="grid" className="m-0 mt-6 focus-visible:outline-none">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bebas text-xl tracking-wide text-foreground">
                    Week {displayWeek} · All Picks
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Every player's picks side-by-side
                    {weekGridData?.hasResults
                      ? " — green = correct, red = wrong"
                      : " — results shown after grading"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResultsModalWeek(displayWeek)}
                  className="text-xs font-medium text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                >
                  Open in modal →
                </button>
              </div>

              {weekGridLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full rounded-lg" />
                  ))}
                </div>
              ) : !weekGridData ? null : (
                <WeekPicksTable data={weekGridData} currentUserId={user?.id ?? 0} />
              )}
            </div>
          </TabsContent>

          {/* ─ Commissioner tab ─ */}
          {isCommissioner && (
            <TabsContent value="commissioner" className="m-0 mt-6 focus-visible:outline-none">
              <div className="shark-card rounded-xl border border-border/50 p-6 space-y-6">
                <div>
                  <h3 className="font-bebas text-2xl tracking-wide text-foreground mb-1">
                    Commissioner Controls
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Grade Week {displayWeek} picks once all games are final.
                  </p>
                </div>

                <Button
                  onClick={handleProcessResults}
                  disabled={processResults.isPending}
                  variant="outline"
                  className="flex items-center gap-2 border-primary/30 text-primary hover:bg-primary/5"
                >
                  <RefreshCw
                    className={cn("w-4 h-4", processResults.isPending && "animate-spin")}
                  />
                  {processResults.isPending
                    ? "Grading…"
                    : `Grade Week ${displayWeek} Results`}
                </Button>

                <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
                  <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
                  <div className="p-6 space-y-4">
                    <div>
                      <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">
                        Invite Code
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Share this code to let players join the pool.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
                        {inviteCode}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="lg"
                          onClick={() => {
                            navigator.clipboard.writeText(inviteCode);
                            toast({ title: "Invite code copied to clipboard!" });
                          }}
                          className="font-bebas text-xl tracking-wider"
                        >
                          <Copy className="w-5 h-5 mr-2" /> Copy Code
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`);
                            toast({ title: "Invite link copied!", description: "Share it with anyone to let them join." });
                          }}
                          className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                        >
                          <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
