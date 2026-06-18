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
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldAlert,
  RefreshCw,
  Check,
  X,
  Copy,
  Zap,
  Play,
  BarChart3,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const NFL_TOTAL_WEEKS = 18;

interface PickEmSeasonViewProps {
  poolId: number;
  poolName: string;
  commissionerId: number;
  currentWeek: number;
  inviteCode: string;
  sandboxMode?: boolean;
  sandboxWeek?: number;
  isSuperAdmin?: boolean;
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

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    hour12: true,
  });
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
  const isLive = game.status === "in_progress";
  const isFinal = game.status === "final";
  const result = game.userPickResult ?? null;

  function teamBtn(
    team: NflPickEmSeasonGame["awayTeam"],
    side: "away" | "home",
    score: number | null | undefined,
    record: string | null | undefined,
  ) {
    const isPicked = pickedTeamId === team.id;
    const isCorrect = isPicked && result === "correct";
    const isWrong = isPicked && result === "incorrect";
    const isHome = side === "home";

    const logo = (
      <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
        <img
          src={team.logoUrl ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`}
          alt={team.name}
          className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    );

    const info = (
      <div className={cn("flex-1 flex flex-col gap-0.5 min-w-0", isHome ? "items-end text-right" : "items-start text-left")}>
        <span className={cn("font-bebas tracking-wide text-base sm:text-lg leading-tight", isPicked ? "text-foreground" : "text-muted-foreground")}>
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
            isLive ? "text-white"
              : isPicked && isCorrect ? "text-green-400"
              : isPicked && isWrong ? "text-destructive/70"
              : "text-foreground/60",
          )}>
            {score}
          </span>
        )}
        {isPicked && (
          <div className={cn("flex items-center gap-1 mt-0.5", isHome && "justify-end")}>
            {isCorrect ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-400 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Correct
              </span>
            ) : isWrong ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-destructive/80">
                ✗ Wrong
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> My Pick
              </span>
            )}
          </div>
        )}
      </div>
    );

    return (
      <button
        type="button"
        disabled={locked || pending}
        onClick={() => !locked && !pending && onPick(team.id, team.name)}
        className={cn(
          "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2 transition-all select-none",
          locked || pending ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
          isPicked && !isCorrect && !isWrong
            ? "border-primary bg-primary/10 ring-2 ring-primary/40"
            : isPicked && isCorrect
              ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/40"
              : isPicked && isWrong
                ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
                : "border-border/40 bg-card/60 hover:border-border",
          isHome ? "flex-row-reverse" : "flex-row",
        )}
      >
        {logo}
        {info}
      </button>
    );
  }

  return (
    <div className={cn(
      "shark-card rounded-xl border overflow-hidden relative",
      isLive ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]" : "border-border/40",
    )}>
      {isLive && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none z-10" />
      )}
      {isLive && (
        <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shadow-md">
          <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
          Live
        </span>
      )}
      <div className="flex items-stretch gap-0">
        {teamBtn(game.awayTeam, "away", game.awayScore, game.awayRecord)}

        {/* Center divider */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[48px] sm:px-3 sm:min-w-[64px]">
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

        {teamBtn(game.homeTeam, "home", game.homeScore, game.homeRecord)}
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

  const teamInfoMap = useMemo(() => {
    const m = new Map<string, { logoUrl: string | null; abbreviation: string }>();
    for (const g of games) {
      m.set(g.awayTeam.id, { logoUrl: g.awayTeam.logoUrl ?? null, abbreviation: g.awayTeam.abbreviation });
      m.set(g.homeTeam.id, { logoUrl: g.homeTeam.logoUrl ?? null, abbreviation: g.homeTeam.abbreviation });
    }
    return m;
  }, [games]);

  // Derive column game IDs from players' actual picks, not from the games list.
  // In sandbox mode the pool's sandboxWeek may differ from the week being viewed,
  // which causes game IDs returned with the schedule to differ from the game IDs
  // stored in picks — producing all-dashes. Using pick-derived IDs fixes this
  // because team IDs (used for logos) are stable across weeks.
  const columnGameIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const p of players) {
      for (const pick of p.picks) {
        if (!seen.has(pick.gameId)) {
          seen.add(pick.gameId);
          ids.push(pick.gameId);
        }
      }
    }
    // Fall back to game-list IDs when there are no picks (e.g. grid before anyone submits)
    if (ids.length === 0) {
      for (const g of games) {
        if (!seen.has(g.id)) { seen.add(g.id); ids.push(g.id); }
      }
    }
    return ids;
  }, [players, games]);

  function teamLogoUrl(teamId: string, fallbackName?: string): string {
    const info = teamInfoMap.get(teamId);
    if (info?.logoUrl) return info.logoUrl;
    const abbr = info?.abbreviation ?? (fallbackName ?? "").slice(0, 3);
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
  }

  const minWidth = Math.max(400, 220 + columnGameIds.length * 60);

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
          className="w-full text-sm border-collapse"
          style={{ minWidth: `${minWidth}px` }}
        >
          <thead>
            <tr className="bg-muted/[0.05]">
              <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-bebas text-xs tracking-wider text-muted-foreground/40">
                Player
              </th>
              {columnGameIds.map((id) => (
                <th
                  key={id}
                  className="border-b border-border/30 border-r border-border/20"
                  style={{ width: 60 }}
                />
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

                  {columnGameIds.map((gameId) => {
                    const pick = pickMap.get(gameId);
                    if (!pick) {
                      return (
                        <td key={gameId} className="px-1 py-2.5 text-center border-r border-border/20" style={{ width: 60 }}>
                          <span className="text-muted-foreground/25 text-xs">—</span>
                        </td>
                      );
                    }
                    const isCorrect = pick.result === "correct";
                    const isWrong = pick.result === "incorrect";
                    return (
                      <td key={gameId} className="px-1 py-2 text-center border-r border-border/20" style={{ width: 60 }}>
                        <div className="flex items-center justify-center">
                          <div
                            className={cn(
                              "relative w-8 h-8 rounded-full p-1 ring-2 flex items-center justify-center",
                              isCorrect
                                ? "bg-green-500/20 ring-green-500/50"
                                : isWrong
                                  ? "bg-red-500/20 ring-red-500/50"
                                  : "bg-white/8 ring-border/25",
                            )}
                          >
                            <img
                              src={teamLogoUrl(pick.pickedTeamId, pick.pickedTeamName)}
                              alt={pick.pickedTeamName}
                              className="w-full h-full object-contain"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                        </div>
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
  poolName,
  commissionerId,
  currentWeek,
  inviteCode,
  sandboxMode = false,
  sandboxWeek: propSandboxWeek,
  isSuperAdmin = false,
}: PickEmSeasonViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCommissioner = user?.id === commissionerId || user?.role === "admin";

  const welcomeKey = `pickem-season-welcome-dismissed-${poolId}-${user?.id ?? "guest"}`;
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try { return localStorage.getItem(welcomeKey) !== "1"; } catch { return false; }
  });
  function dismissWelcome() {
    try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
    setShowWelcome(false);
  }

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

  // Sandbox controls state
  const [localSandboxMode, setLocalSandboxMode] = useState(sandboxMode);
  const [localSandboxWeek, setLocalSandboxWeek] = useState(propSandboxWeek ?? currentWeek);
  const [togglingMode, setTogglingMode] = useState(false);
  const [sbLoadingWeek, setSbLoadingWeek] = useState(false);
  const [sbSimulating, setSbSimulating] = useState(false);
  const [sbSimResult, setSbSimResult] = useState<{ week: number; graded: number } | null>(null);

  const handleToggleSandbox = async (enabled: boolean) => {
    setTogglingMode(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/pools/${poolId}/sandbox-mode`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sandboxMode: enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setLocalSandboxMode(enabled);
      toast({ title: enabled ? "Sandbox enabled" : "Sandbox disabled" });
      queryClient.invalidateQueries({ queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, { week: displayWeek }) });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: (err as Error).message });
    } finally { setTogglingMode(false); }
  };

  const handleLoadSandboxWeek = async () => {
    setSbLoadingWeek(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/pickem-season/sandbox-week`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: localSandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `Week ${localSandboxWeek} loaded` });
      queryClient.invalidateQueries({ queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, { week: displayWeek }) });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load week", description: (err as Error).message });
    } finally { setSbLoadingWeek(false); }
  };

  const handleSimulateGrading = async () => {
    setSbSimulating(true);
    setSbSimResult(null);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/pickem-season/simulate-grading`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setSbSimResult({ week: data.week, graded: data.graded });
      toast({ title: "Grading complete", description: `${data.graded} picks graded for week ${data.week}.` });
      queryClient.invalidateQueries({ queryKey: getGetNflPickEmSeasonGamesQueryKey(poolId, { week: displayWeek }) });
      queryClient.invalidateQueries({ queryKey: getGetNflPickEmSeasonLeaderboardQueryKey(poolId) });
    } catch (err) {
      toast({ variant: "destructive", title: "Simulation failed", description: (err as Error).message });
    } finally { setSbSimulating(false); }
  };

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

      {/* ── Week navigator ── */}
      <div className="flex items-center gap-2 mb-6">
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
          <div className="relative">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
              <TabsTrigger
                value="picks"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2 items-center"
              >
                <Zap className="w-4 h-4 md:w-5 md:h-5" /> This Week's Picks
              </TabsTrigger>
              <TabsTrigger
                value="leaderboard"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2 items-center"
              >
                <Trophy className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
              </TabsTrigger>
              <TabsTrigger
                value="grid"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2 items-center"
              >
                <LayoutGrid className="w-4 h-4 md:w-5 md:h-5" /> Weekly Grid
              </TabsTrigger>
              <TabsTrigger
                value="stats"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2 items-center"
              >
                <BarChart3 className="w-4 h-4 md:w-5 md:h-5" /> Stats
              </TabsTrigger>
              {isCommissioner && (
                <TabsTrigger
                  value="commissioner"
                  className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2 items-center"
                >
                  <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                </TabsTrigger>
              )}
            </TabsList>
            </div>
            <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
          </div>

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
                {/* ── Welcome banner ── */}
                {showWelcome && (
                  <div className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 pr-10">
                    <span className="text-xl leading-none mt-0.5">🏈</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground leading-snug">
                        Welcome to {poolName}!
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                        Pick the winner of every NFL game each week. Picks accumulate all season — whoever has the most correct picks by Week 18 wins the prize pot. Each game locks at kickoff. Good luck! 🏈
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

                <div className="space-y-3">
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

          {/* ─ Stats tab ─ */}
          <TabsContent value="stats" className="m-0 mt-6 focus-visible:outline-none">
            {lbLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/40 bg-card/60 p-4 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground/60 font-semibold uppercase tracking-wider">Players</span>
                    <span className="font-bebas text-3xl text-foreground">{leaderboard?.entries.length ?? 0}</span>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card/60 p-4 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground/60 font-semibold uppercase tracking-wider">Current Week</span>
                    <span className="font-bebas text-3xl text-foreground">{displayWeek}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/40 bg-card/60 p-4 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground/60 font-semibold uppercase tracking-wider">Season Leader</span>
                    <span className="font-bebas text-xl text-foreground truncate">
                      {leaderboard?.entries[0]
                        ? (leaderboard.entries[0].displayName || leaderboard.entries[0].username)
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Season standings table */}
                {(leaderboard?.entries.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/30 bg-muted/[0.04]">
                      <h3 className="font-bebas text-lg tracking-wide text-foreground">Season Standings — Week {displayWeek}</h3>
                    </div>
                    <div className="divide-y divide-border/20">
                      {leaderboard!.entries.slice(0, 10).map((entry) => {
                        const weekScore = entry.weeklyScores?.[String(displayWeek)];
                        const seasonCorrect = entry.seasonCorrect ?? 0;
                        const seasonTotal = entry.seasonTotal ?? 0;
                        const pct = seasonTotal > 0 ? Math.round((seasonCorrect / seasonTotal) * 100) : null;
                        const isMe = entry.userId === user?.id;
                        return (
                          <div
                            key={entry.userId}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2.5",
                              isMe ? "bg-primary/5" : "bg-transparent",
                            )}
                          >
                            <span className={cn(
                              "font-bebas text-sm w-5 text-center shrink-0",
                              entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-amber-600" : "text-muted-foreground/40",
                            )}>
                              {entry.rank === 1 ? "🥇" : entry.rank}
                            </span>
                            <span className={cn("flex-1 font-medium text-sm truncate", isMe ? "text-primary" : "text-foreground")}>
                              {entry.displayName || entry.username}
                              {isMe && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>}
                            </span>
                            {weekScore != null && (
                              <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
                                Wk {weekScore.correct}/{weekScore.total}
                              </span>
                            )}
                            <span className="font-bebas text-base text-foreground tabular-nums shrink-0 w-16 text-right">
                              {seasonCorrect}
                              <span className="text-muted-foreground/40">/{seasonTotal}</span>
                              {pct != null && (
                                <span className="ml-1 text-[10px] text-green-400/70">({pct}%)</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
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

                {isSuperAdmin && (
                  <div className="rounded-xl border border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,rgba(10,14,26,1)_100%)] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bebas text-xl tracking-wide text-yellow-400 flex items-center gap-2">
                          <Zap className="w-4 h-4" /> Sandbox Mode
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Use 2025 NFL schedule for testing — picks always unlocked</p>
                      </div>
                      <Switch checked={localSandboxMode} disabled={togglingMode} onCheckedChange={handleToggleSandbox} />
                    </div>
                    {localSandboxMode && (
                      <>
                        <div className="flex items-end gap-3">
                          <div className="grid gap-2 flex-1 max-w-[140px]">
                            <Label className="font-bebas text-lg tracking-wide text-yellow-300/80">Week (1–18)</Label>
                            <input
                              type="number"
                              min={1}
                              max={18}
                              value={localSandboxWeek}
                              onChange={e => setLocalSandboxWeek(Math.min(18, Math.max(1, parseInt(e.target.value) || 1)))}
                              className="h-9 w-full rounded-md border border-yellow-500/20 bg-background/50 px-3 text-sm text-foreground"
                            />
                          </div>
                          <Button
                            onClick={handleLoadSandboxWeek}
                            disabled={sbLoadingWeek}
                            className="h-9 font-bebas text-lg tracking-wider bg-yellow-600 hover:bg-yellow-500 text-black shrink-0"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            {sbLoadingWeek ? "Loading…" : "Load Week"}
                          </Button>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            onClick={handleSimulateGrading}
                            disabled={sbSimulating}
                            variant="outline"
                            className="font-bebas text-lg tracking-wider border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
                          >
                            <BarChart3 className="w-4 h-4 mr-1.5" />
                            {sbSimulating ? "Grading…" : "Simulate Grading"}
                          </Button>
                          {sbSimResult && (
                            <span className="text-xs text-yellow-400 font-semibold">
                              {sbSimResult.graded} picks graded — week {sbSimResult.week}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

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
    </>
  );
}
