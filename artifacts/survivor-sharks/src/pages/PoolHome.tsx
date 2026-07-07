import { useParams, Link, useLocation, Redirect } from "wouter";
import { useGetPool, useGetPickEmLeaderboard, getGetPoolQueryKey, getGetPickEmLeaderboardQueryKey, useGetWcBracket, getGetWcBracketQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { AdSlot } from "@/components/AdSlot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ban, Target, Activity, Users, Skull, ShieldAlert, Trophy, RefreshCw, Zap, Bandage, Crosshair, ListOrdered, Dice5, Camera, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import { MatchupPickGrid } from "@/components/MatchupPickGrid";
import { DailyPickGrid } from "@/components/DailyPickGrid";
import { SurvivorGrid } from "@/components/SurvivorGrid";
import { Leaderboard } from "@/components/Leaderboard";
import { KillHistory } from "@/components/KillHistory";
import { PoolStats } from "@/components/PoolStats";
import { CommissionerPanel } from "@/components/CommissionerPanel";
import { InjuriesTab } from "@/components/InjuriesTab";
import { PickEmView } from "@/components/PickEmView";
import { GroupStagePredictorView } from "@/components/GroupStagePredictorView";
import { NflDivisionPredictorView } from "@/components/NflDivisionPredictorView";
import { CrazyEightsView } from "@/components/CrazyEightsView";
import { CrazyEightsGrid } from "@/components/CrazyEightsGrid";
import { CrazyEightsLeaderboard } from "@/components/CrazyEightsLeaderboard";
import { CrazyEightsStats } from "@/components/CrazyEightsStats";
import { NflConfidenceView, NflConfidenceCommissionerPanel } from "@/components/NflConfidenceView";
import { NflConfidenceGrid } from "@/components/NflConfidenceGrid";
import { NflConfidenceLeaderboard } from "@/components/NflConfidenceLeaderboard";
import { NflConfidenceStats } from "@/components/NflConfidenceStats";
import { NflConfidenceWeeklyView, NflConfidenceWeeklyCommissionerPanel, NflConfidenceWeeklyWinnerBanner } from "@/components/NflConfidenceWeeklyView";
import { NflConfidenceWeeklyGrid } from "@/components/NflConfidenceWeeklyGrid";
import { NflConfidenceWeeklyLeaderboard } from "@/components/NflConfidenceWeeklyLeaderboard";
import { NflConfidenceSnapshot } from "@/components/NflConfidenceSnapshot";
import { NflConfidenceStandings } from "@/components/NflConfidenceStandings";
import { SurvivorStandings } from "@/components/SurvivorStandings";
import { NflConfidenceWeeklyStats } from "@/components/NflConfidenceWeeklyStats";
import { PickEmSeasonView } from "@/components/PickEmSeasonView";
import { WcBracketView } from "@/components/WcBracketView";
import { PrizeDisplay } from "@/components/PrizeDisplay";
import { calculatePayouts, scaledPrizePot, ORDINALS } from "@/lib/calculatePayouts";

export default function PoolHome() {
  const { poolId: poolIdStr } = useParams();
  const poolId = parseInt(poolIdStr || "0");
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: pool, isLoading, error } = useGetPool(poolId, { query: { enabled: !!poolId, queryKey: getGetPoolQueryKey(poolId) } });

  const isPickEm = (pool?.poolType as string) === "pickem";
  const isGsp = (pool?.poolType as string) === "group_stage_predictor";
  const isNdp = (pool?.poolType as string) === "nfl_division_predictor";
  const isCrazyEights = (pool?.poolType as string) === "crazy_8s";
  const isNflConfidence = (pool?.poolType as string) === "nfl_confidence";
  const isNflConfidenceWeekly = (pool?.poolType as string) === "nfl_confidence_weekly";
  const isPickEmSeason = (pool?.poolType as string) === "pickem_season";
  const isClassicSeason = (pool?.poolType as string) === "season";
  const isWcBracket = (pool?.poolType as string) === "wc_bracket";
  const { data: pickemLeaderboard } = useGetPickEmLeaderboard(poolId, undefined, {
    query: {
      enabled: isPickEm && !!poolId,
      queryKey: getGetPickEmLeaderboardQueryKey(poolId),
    },
  });

  // Reuse the same query key as WcBracketView — TanStack Query deduplicates the
  // request so no extra network call is made when both components are mounted.
  const { data: bracketRoundData } = useGetWcBracket(poolId, {
    query: {
      enabled: isWcBracket && !!poolId,
      queryKey: getGetWcBracketQueryKey(poolId),
    },
  });

  const mobilePrizeData = (() => {
    if (!pool) return null;
    const breakdown = calculatePayouts(
      (pool as any).prizeStructure,
      pool.maxEntries,
      pool.totalMembers,
      (pool as any).prizeMode ?? "fixed",
      pool.entryFee,
    );
    const pot = scaledPrizePot(pool.prizePot, pool.maxEntries, pool.totalMembers);
    return { breakdown, pot };
  })();

  // Redirect pickem pools from /pools/:poolId → /pools/:poolId/pickem
  if (pool && (pool.poolType as string) === "pickem" && !location.endsWith("/pickem")) {
    return <Redirect to={`/pools/${poolId}/pickem`} />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-12 bg-destructive/5 border border-destructive/20 rounded-lg max-w-md">
            <h2 className="font-bebas text-4xl text-destructive mb-4 tracking-wider">Pool Not Found</h2>
            <p className="text-muted-foreground mb-8">The pool you're looking for doesn't exist or you don't have access to it.</p>
            <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCommissioner = pool?.commissionerId === user?.id || user?.role === 'admin';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <NavBar />
      
      <main className="flex-1 container px-4 py-8 max-w-7xl mx-auto">
        
        {isLoading || !pool ? (
          <div className="space-y-8">
            <div className="flex justify-between">
              <div>
                <Skeleton className="h-12 w-[300px] mb-3" />
                <Skeleton className="h-5 w-[200px]" />
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-20 w-24 rounded-md" />
                <Skeleton className="h-20 w-24 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-[400px] w-full rounded-md" />
          </div>
        ) : (
          <div className="space-y-2 md:space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-6 pb-2 md:pb-6 border-b border-border/50">
              <div className="min-w-0">
                <h1 className="font-bebas text-3xl md:text-6xl tracking-wide text-primary drop-shadow-sm mb-1 md:mb-2">{pool.name}</h1>
                {mobilePrizeData?.breakdown && mobilePrizeData.breakdown.length > 0 ? (
                  <div className="md:hidden flex items-center flex-wrap gap-x-1 gap-y-0.5 text-sm font-semibold text-yellow-400 mt-1">
                    <Trophy className="w-3.5 h-3.5 shrink-0 mr-0.5" />
                    {mobilePrizeData.breakdown.slice(0, 3).map((p, i) => (
                      <span key={p.place} className="flex items-center gap-x-1">
                        {i > 0 && <span className="text-yellow-400/40 select-none">·</span>}
                        <span className="text-yellow-300/70 text-xs font-medium">{ORDINALS[p.place - 1]}</span>
                        <span>${p.amount.toLocaleString()}</span>
                      </span>
                    ))}
                    {mobilePrizeData.breakdown.length > 3 && (
                      <>
                        <span className="text-yellow-400/40 select-none">·</span>
                        <span className="text-yellow-400/60 text-xs font-medium">+{mobilePrizeData.breakdown.length - 3} more</span>
                      </>
                    )}
                  </div>
                ) : mobilePrizeData?.pot && mobilePrizeData.pot > 0 ? (
                  <div className="md:hidden flex items-center gap-1.5 text-sm font-semibold text-yellow-400 mt-1">
                    <Trophy className="w-3.5 h-3.5" />
                    Prize Pot: ${mobilePrizeData.pot.toLocaleString()}
                  </div>
                ) : null}
                <div className="flex items-center gap-2 text-[10px] md:text-sm font-medium text-muted-foreground uppercase tracking-wider overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap [&>*]:shrink-0">
                  <span className="bg-muted/50 px-2 py-1 rounded text-foreground">{pool.sport}</span>
                  {pool.poolType === "season" && (
                    <span className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">
                      <Trophy className="w-3 h-3" /> Survivor
                    </span>
                  )}
                  {pool.poolType === "weekly" && (
                    <span className="flex items-center gap-1 bg-accent/10 text-accent border border-accent/20 px-2 py-1 rounded">
                      <RefreshCw className="w-3 h-3" /> Weekly
                    </span>
                  )}
                  {pool.poolType === "mid_season" && (
                    <span className="flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 px-2 py-1 rounded">
                      <Zap className="w-3 h-3" /> Mid Season {pool.startWeek ? `(Wk ${pool.startWeek}+)` : ""}
                    </span>
                  )}
                  {(pool.poolType as string) === "pickem" && (
                    <span className="flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded">
                      <Crosshair className="w-3 h-3" /> Pick-Ems
                    </span>
                  )}
                  {(pool.poolType as string) === "group_stage_predictor" && (
                    <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded">
                      <ListOrdered className="w-3 h-3" /> Group Predictor
                    </span>
                  )}
                  {isWcBracket && (
                    <span className="flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded">
                      <Globe className="w-3 h-3" /> {!pool.isActive ? "Complete" : bracketRoundData?.roundLabel ?? "Bracket"}
                    </span>
                  )}
                  {isNdp && (
                    <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded">
                      <ListOrdered className="w-3 h-3" /> Division Predictor
                    </span>
                  )}
                  {isCrazyEights && (
                    <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded">
                      <Dice5 className="w-3 h-3" /> {pool.sport === "nhl" ? "Hit the Ice!" : "Crazy 8's"}{(pool as any).pickFrequency ? ` · ${(pool as any).pickFrequency === "daily" ? "Daily" : "Weekly"}` : ""}
                    </span>
                  )}
                  {isNflConfidence && (
                    <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded">
                      <Zap className="w-3 h-3" /> Confidence — Season
                    </span>
                  )}
                  {isNflConfidenceWeekly && (
                    <span className="flex items-center gap-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded">
                      <Zap className="w-3 h-3" /> Confidence — Weekly
                    </span>
                  )}
                  {isNflConfidenceWeekly && (pool as any).sandboxMode && (
                    <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded font-bold tracking-widest text-[9px] uppercase">
                      <Zap className="w-2.5 h-2.5" /> Sandbox
                    </span>
                  )}
                  {isNflConfidence && (pool as any).sandboxMode && (
                    <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded font-bold tracking-widest text-[9px] uppercase">
                      <Zap className="w-2.5 h-2.5" /> Sandbox
                    </span>
                  )}
                  {pool.sport === "nfl" && ["season", "weekly", "mid_season"].includes(pool.poolType) && (pool as any).sandboxMode && (
                    <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded font-bold tracking-widest text-[9px] uppercase">
                      <Zap className="w-2.5 h-2.5" /> Sandbox
                    </span>
                  )}
                  {isNdp && (pool as any).sandboxMode && (
                    <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded font-bold tracking-widest text-[9px] uppercase">
                      <Zap className="w-2.5 h-2.5" /> Sandbox
                    </span>
                  )}
                  <span>Season {pool.season}</span>
                  {pool.sport !== "intl" && pool.sport !== "worldcup" && (
                    <span className="flex items-center gap-1 text-accent"><Activity className="w-4 h-4" /> Wk {pool.currentWeek}</span>
                  )}
                  {/* Compact inline stat — mobile only */}
                  <span className="md:hidden bg-card border border-border/50 px-2 py-1 rounded-lg text-center shadow-sm">
                    {isPickEm ? (
                      <span className="font-bebas text-sm text-green-400 leading-none">
                        {pickemLeaderboard?.entries.length ?? 0}<span className="text-[10px] text-muted-foreground/60">/{pool.totalMembers}</span>
                      </span>
                    ) : (
                      <span className="font-bebas text-sm text-accent leading-none">
                        {pool.activeCount}<span className="text-[10px] text-muted-foreground/60">/{pool.totalMembers}</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {/* Full stat boxes — desktop only */}
              <div className="hidden md:flex gap-4 shrink-0">
                {isPickEm ? (
                  <div className="bg-card border border-border/50 px-5 py-3 rounded-lg text-center shadow-sm">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center justify-center gap-1">
                      <Target className="w-3 h-3" /> Players Picked
                    </div>
                    <div className="font-bebas text-3xl text-green-400">
                      {pickemLeaderboard?.entries.length ?? 0}
                      <span className="text-xl text-muted-foreground/60"> / {pool.totalMembers} players</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-card border border-border/50 px-5 py-3 rounded-lg text-center shadow-sm">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1 flex items-center justify-center gap-1">
                      <Users className="w-3 h-3" /> Alive
                    </div>
                    <div className="font-bebas text-3xl text-accent">
                      {pool.activeCount} <span className="text-xl text-muted-foreground/60">/ {pool.totalMembers}</span>
                    </div>
                  </div>
                )}
                <PrizeDisplay
                  variant="pool-home"
                  prizeStructure={(pool as any).prizeStructure}
                  prizePot={pool.prizePot}
                  prizeMode={(pool as any).prizeMode ?? "fixed"}
                  entryFee={pool.entryFee}
                  maxEntries={pool.maxEntries}
                  actualEntries={pool.totalMembers}
                />
              </div>
            </div>

            {!pool.isActive && (pool as any).closureReason === "min_entries_not_met" && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
                <Ban className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-bebas text-xl tracking-wide text-destructive">Pool Cancelled</p>
                  <p className="text-sm text-muted-foreground">Minimum entries were not reached before the season started. No games were played.</p>
                </div>
              </div>
            )}

            {isPickEmSeason ? (
              <PickEmSeasonView
                poolId={pool.id}
                poolName={pool.name}
                poolDescription={pool.description ?? ""}
                commissionerId={pool.commissionerId}
                currentWeek={pool.currentWeek}
                inviteCode={pool.inviteCode ?? ""}
                sandboxMode={(pool as any).sandboxMode ?? false}
                sandboxWeek={(pool as any).sandboxWeek ?? 1}
                isSuperAdmin={user?.role === "admin"}
                isActive={pool.isActive}
              />
            ) : (pool.poolType as string) === "pickem" ? (
              <PickEmView poolId={pool.id} poolName={pool.name} poolDescription={pool.description ?? ""} commissionerId={pool.commissionerId} inviteCode={pool.inviteCode} sport={pool.sport} pickFrequency={(pool as any).pickFrequency} isRecurring={pool.isRecurring} />
            ) : isGsp ? (
              <GroupStagePredictorView poolId={pool.id} isCommissioner={isCommissioner} inviteCode={pool.inviteCode} />
            ) : isNdp ? (
              <NflDivisionPredictorView poolId={pool.id} isCommissioner={isCommissioner} inviteCode={pool.inviteCode} sandboxMode={(pool as any).sandboxMode ?? false} isSuperAdmin={user?.role === "admin"} />
            ) : isCrazyEights ? (
              <Tabs defaultValue="picks" className="w-full">
                <div className="relative">
                  <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
                      <TabsTrigger value="picks" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400 flex gap-2">
                        <Dice5 className="w-4 h-4 md:w-5 md:h-5" /> {pool.sport === "nhl" ? "Weekend Picks" : "Today's Picks"}
                      </TabsTrigger>
                      <TabsTrigger value="leaderboard" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
                      </TabsTrigger>
                      <TabsTrigger value="grid" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        {pool.sport === "nhl" ? "Weekend Grid" : "Daily Grid"}
                      </TabsTrigger>
                      <TabsTrigger value="stats" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        Stats
                      </TabsTrigger>
                      {isCommissioner && (
                        <TabsTrigger value="commissioner" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2">
                          <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                  <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
                </div>
                <div className="mt-8">
                  <TabsContent value="picks" className="m-0 focus-visible:outline-none">
                    <CrazyEightsView poolId={pool.id} sport={pool.sport} />
                  </TabsContent>
                  <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
                    <CrazyEightsLeaderboard poolId={pool.id} sport={pool.sport} sandboxMode={(pool as any).sandboxMode ?? false} />
                  </TabsContent>
                  <TabsContent value="grid" className="m-0 focus-visible:outline-none">
                    <CrazyEightsGrid poolId={pool.id} sport={pool.sport} sandboxMode={(pool as any).sandboxMode ?? false} />
                  </TabsContent>
                  <TabsContent value="stats" className="m-0 focus-visible:outline-none">
                    <CrazyEightsStats poolId={pool.id} sport={pool.sport} sandboxMode={(pool as any).sandboxMode ?? false} />
                  </TabsContent>
                  {isCommissioner && (
                    <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
                      <CommissionerPanel poolId={pool.id} isSuperAdmin={user?.role === "admin"} />
                    </TabsContent>
                  )}
                </div>
              </Tabs>
            ) : isNflConfidenceWeekly ? (
              <div className="space-y-4">
              <NflConfidenceWeeklyWinnerBanner poolId={pool.id} currentWeek={pool.currentWeek} />
              <Tabs defaultValue="picks" className="w-full">
                <div className="relative">
                  <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
                      <TabsTrigger value="picks" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 flex gap-2">
                        <Zap className="w-4 h-4 md:w-5 md:h-5" /> This Week's Picks
                      </TabsTrigger>
                      <TabsTrigger value="leaderboard" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
                      </TabsTrigger>
                      <TabsTrigger value="grid" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        Weekly Grid
                      </TabsTrigger>
                      <TabsTrigger value="snapshot" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        <Camera className="w-4 h-4 md:w-5 md:h-5" /> Snapshot
                      </TabsTrigger>
                      <TabsTrigger value="stats" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        Stats
                      </TabsTrigger>
                      {isCommissioner && (
                        <TabsTrigger value="commissioner" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2">
                          <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                  <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
                </div>
                <div className="mt-8">
                  <TabsContent value="picks" className="m-0 focus-visible:outline-none">
                    <NflConfidenceWeeklyView poolId={pool.id} currentWeek={pool.currentWeek} />
                  </TabsContent>
                  <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
                    <NflConfidenceWeeklyLeaderboard poolId={pool.id} initialWeek={pool.currentWeek} />
                  </TabsContent>
                  <TabsContent value="grid" className="m-0 focus-visible:outline-none">
                    <NflConfidenceWeeklyGrid poolId={pool.id} initialWeek={pool.currentWeek} />
                  </TabsContent>
                  <TabsContent value="snapshot" className="m-0 focus-visible:outline-none">
                    <NflConfidenceSnapshot poolId={pool.id} currentWeek={pool.currentWeek} variant="weekly" poolName={pool.name} />
                  </TabsContent>
                  <TabsContent value="stats" className="m-0 focus-visible:outline-none">
                    <NflConfidenceWeeklyStats poolId={pool.id} initialWeek={pool.currentWeek} />
                  </TabsContent>
                  {isCommissioner && (
                    <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
                      <NflConfidenceWeeklyCommissionerPanel
                        poolId={pool.id}
                        inviteCode={pool.inviteCode ?? null}
                        poolName={pool.name}
                        poolDescription={(pool as any).description ?? null}
                        currentWeek={pool.currentWeek}
                        sandboxMode={(pool as any).sandboxMode ?? false}
                        sandboxWeek={(pool as any).sandboxWeek ?? 1}
                        isSuperAdmin={user?.role === "admin"}
                      />
                    </TabsContent>
                  )}
                </div>
              </Tabs>
              </div>
            ) : isNflConfidence ? (
              <Tabs defaultValue="picks" className="w-full">
                <div className="relative">
                  <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
                      <TabsTrigger value="picks" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400 flex gap-2">
                        <Zap className="w-4 h-4 md:w-5 md:h-5" /> This Week's Picks
                      </TabsTrigger>
                      <TabsTrigger value="leaderboard" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
                      </TabsTrigger>
                      <TabsTrigger value="grid" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        Weekly Grid
                      </TabsTrigger>
                      <TabsTrigger value="snapshot" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        <Camera className="w-4 h-4 md:w-5 md:h-5" /> Snapshot
                      </TabsTrigger>
                      <TabsTrigger value="standings" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        <ListOrdered className="w-4 h-4 md:w-5 md:h-5" /> Standings
                      </TabsTrigger>
                      <TabsTrigger value="stats" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                        Stats
                      </TabsTrigger>
                      {isCommissioner && (
                        <TabsTrigger value="commissioner" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2">
                          <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                  <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
                </div>
                <div className="mt-8">
                  <TabsContent value="picks" className="m-0 focus-visible:outline-none">
                    <NflConfidenceView poolId={pool.id} currentWeek={pool.currentWeek} />
                  </TabsContent>
                  <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
                    <NflConfidenceLeaderboard poolId={pool.id} initialWeek={pool.currentWeek} />
                  </TabsContent>
                  <TabsContent value="grid" className="m-0 focus-visible:outline-none">
                    <NflConfidenceGrid poolId={pool.id} initialWeek={pool.currentWeek} />
                  </TabsContent>
                  <TabsContent value="snapshot" className="m-0 focus-visible:outline-none">
                    <NflConfidenceSnapshot poolId={pool.id} currentWeek={pool.currentWeek} variant="season" poolName={pool.name} />
                  </TabsContent>
                  <TabsContent value="standings" className="m-0 focus-visible:outline-none">
                    <NflConfidenceStandings poolId={pool.id} />
                  </TabsContent>
                  <TabsContent value="stats" className="m-0 focus-visible:outline-none">
                    <NflConfidenceStats poolId={pool.id} initialWeek={pool.currentWeek} />
                  </TabsContent>
                  {isCommissioner && (
                    <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
                      <NflConfidenceCommissionerPanel
                        poolId={pool.id}
                        inviteCode={pool.inviteCode ?? null}
                        poolName={pool.name}
                        poolDescription={(pool as any).description ?? null}
                        currentWeek={pool.currentWeek}
                        sandboxMode={(pool as any).sandboxMode ?? false}
                        sandboxWeek={(pool as any).sandboxWeek ?? 1}
                        isSuperAdmin={user?.role === "admin"}
                      />
                    </TabsContent>
                  )}
                </div>
              </Tabs>
            ) : isWcBracket ? (
              <WcBracketView
                poolId={pool.id}
                isCommissioner={isCommissioner}
                inviteCode={pool.inviteCode ?? undefined}
                poolName={pool.name}
                poolDescription={pool.description ?? undefined}
              />
            ) : (
            <Tabs defaultValue="pick" className="w-full">
              <div className="relative">
              <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
                <TabsTrigger value="pick" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2">
                  <Target className="w-4 h-4 md:w-5 md:h-5" /> Make Pick
                </TabsTrigger>
                <TabsTrigger value="leaderboard" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                  <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
                </TabsTrigger>
                {isClassicSeason && (
                  <TabsTrigger value="standings" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                    <ListOrdered className="w-4 h-4 md:w-5 md:h-5" /> Standings
                  </TabsTrigger>
                )}
                <TabsTrigger value="grid" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                  Grid
                </TabsTrigger>
                <TabsTrigger value="history" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive flex gap-2">
                  <Skull className="w-4 h-4 md:w-5 md:h-5" /> Kill History
                </TabsTrigger>
                <TabsTrigger value="stats" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                  Stats
                </TabsTrigger>
                <TabsTrigger value="injuries" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 flex gap-2">
                  <Bandage className="w-4 h-4 md:w-5 md:h-5" /> Injuries
                </TabsTrigger>
                {isCommissioner && (
                  <TabsTrigger value="commissioner" className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2">
                    <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                  </TabsTrigger>
                )}
              </TabsList>
              </div>
              <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
            </div>

              <div className="mt-8">
                <TabsContent value="pick" className="m-0 focus-visible:outline-none">
                  {(pool as any).pickFrequency === "daily" ? (
                    <DailyPickGrid poolId={pool.id} />
                  ) : (
                    <MatchupPickGrid poolId={pool.id} sport={pool.sport as "nfl" | "mlb" | "nba" | "nhl" | "fifa"} poolType={pool.poolType} currentWeek={pool.currentWeek} isActive={pool.isActive} />
                  )}
                </TabsContent>
                <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
                  <Leaderboard poolId={pool.id} pickFrequency={(pool as any).pickFrequency} maxEntries={pool.maxEntries ?? undefined} totalMembers={pool.totalMembers} prizeMode={(pool as any).prizeMode ?? "fixed"} entryFee={pool.entryFee} />
                </TabsContent>
                {isClassicSeason && (
                  <TabsContent value="standings" className="m-0 focus-visible:outline-none">
                    <SurvivorStandings poolId={pool.id} />
                  </TabsContent>
                )}
                <TabsContent value="grid" className="m-0 focus-visible:outline-none">
                  <SurvivorGrid poolId={pool.id} />
                </TabsContent>
                <TabsContent value="history" className="m-0 focus-visible:outline-none">
                  <KillHistory poolId={pool.id} />
                </TabsContent>
                <TabsContent value="stats" className="m-0 focus-visible:outline-none">
                  <PoolStats poolId={pool.id} />
                </TabsContent>
                <TabsContent value="injuries" className="m-0 focus-visible:outline-none">
                  <InjuriesTab sport={pool.sport as "nfl" | "mlb" | "nba" | "nhl" | "fifa"} />
                </TabsContent>
                {isCommissioner && (
                  <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
                    <CommissionerPanel poolId={pool.id} isSuperAdmin={user?.role === "admin"} />
                  </TabsContent>
                )}
              </div>
            </Tabs>
            )}
          </div>
        )}

        <div className="mt-12">
          <AdSlot />
        </div>
      </main>
    </div>
  );
}
