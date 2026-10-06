import { useEffect, useState } from "react";
import { useParams, Link, useLocation, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetPool, useGetPickEmLeaderboard, getGetPoolQueryKey, getGetPickEmLeaderboardQueryKey, useGetWcBracket, getGetWcBracketQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { AdSlot } from "@/components/AdSlot";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ban, Target, Activity, Users, Skull, ShieldAlert, Trophy, RefreshCw, Zap, Bandage, Crosshair, ListOrdered, Dice5, Camera, Globe, XCircle, Circle } from "lucide-react";
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
import { NhlDivisionPredictorView } from "@/components/NhlDivisionPredictorView";
import { CrazyEightsPoolTabs } from "@/components/CrazyEightsPoolTabs";
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
import { MlbPostseasonBracketView } from "@/components/MlbPostseasonBracketView";
import { PrizeDisplay } from "@/components/PrizeDisplay";
import { PoolEndedResult } from "@/components/PoolEndedResult";
import { SportLogo } from "@/components/SportLogo";
import { PickVisibilityNotice } from "@/components/PickVisibilityNotice";
import { PoolRulesSheet } from "@/components/PoolRulesSheet";
import { SPORT_LABELS } from "@/lib/sport-branding";
import { calculatePayouts, scaledPrizePot, ORDINALS } from "@/lib/calculatePayouts";
import { getPoolRules } from "@/lib/poolRules";
import { useAndroidPoolBackToDashboard } from "@/hooks/useAndroidPoolBackToDashboard";
import { POOL_TABS_LIST_CLASS, POOL_TAB_TRIGGER_BASE, POOL_TAB_ICON_CLASS } from "@/lib/poolTabStyles";
import { cn } from "@/lib/utils";

export default function PoolHome() {
  const { poolId: poolIdStr } = useParams();
  const poolId = parseInt(poolIdStr || "0");
  const { user } = useAuth();
  const [location] = useLocation();
  const requestedTab = new URLSearchParams(location.split("?")[1] ?? "").get("tab");
  const [activeTab, setActiveTab] = useState(requestedTab === "leaderboard" ? "leaderboard" : "picks");
  const [pickemSeasonDetailedView, setPickemSeasonDetailedView] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useAndroidPoolBackToDashboard(Boolean(user && poolId));

  const { data: pool, isLoading, error } = useGetPool(poolId, {
    query: {
      enabled: !!poolId,
      queryKey: getGetPoolQueryKey(poolId),
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: (query) => {
        const current = query.state.data;
        const nhlRecurringWeeklyBonus =
          current?.poolType === "pickem" &&
          current?.sport === "nhl" &&
          current?.pickFrequency === "weekly" &&
          current?.isRecurring === true;
        return current?.weeklyBonusEnabled &&
          current.weeklyBonusMinPlayers != null &&
          current.weeklyBonusLockedActive !== true &&
          current.isActive &&
          (["pickem_season", "nfl_confidence"].includes(current.poolType) || nhlRecurringWeeklyBonus)
          ? 15_000
          : false;
      },
    },
  });

  const isPickEm = (pool?.poolType as string) === "pickem";
  const isGsp = (pool?.poolType as string) === "group_stage_predictor";
  const isNdp = (pool?.poolType as string) === "nfl_division_predictor";
  const isNhlNdp = (pool?.poolType as string) === "nhl_division_predictor";
  const isCrazyEights = (pool?.poolType as string) === "crazy_8s";
  const isNflConfidence = (pool?.poolType as string) === "nfl_confidence";
  const isNflConfidenceWeekly = (pool?.poolType as string) === "nfl_confidence_weekly";
  const isPickEmSeason = (pool?.poolType as string) === "pickem_season";
  const isClassicSeason = (pool?.poolType as string) === "season";
  const isNhlRecurringWeeklyPickEm = Boolean(
    isPickEm &&
    pool?.sport === "nhl" &&
    pool?.pickFrequency === "weekly" &&
    pool?.isRecurring === true,
  );
  const showsSeasonWeeklyBonus = Boolean(
    pool?.weeklyBonusEnabled && (isPickEmSeason || isNflConfidence || isNhlRecurringWeeklyPickEm),
  );
  const isWcBracket = (pool?.poolType as string) === "wc_bracket";
  const isMlbBracket = (pool?.poolType as string) === "mlb_bracket";
  const isNbaAts = (pool?.poolType as string) === "nba_ats";
  const isNflSurvivor =
    pool?.sport === "nfl" &&
    ["season", "weekly", "mid_season"].includes(pool.poolType);

  const hasPoolLeaderboardTab = Boolean(
    pool &&
      (isPickEm ||
        isNbaAts ||
        isPickEmSeason ||
        isCrazyEights ||
        isNflConfidence ||
        isNflConfidenceWeekly ||
        (!isGsp &&
          !isNdp &&
          !isNhlNdp &&
          !isWcBracket &&
          !isMlbBracket &&
          !isPickEm &&
          !isNbaAts &&
          !isPickEmSeason &&
          !isCrazyEights &&
          !isNflConfidence &&
          !isNflConfidenceWeekly)),
  );

  useEffect(() => {
    if (!pool || requestedTab === "leaderboard") return;
    setActiveTab(isCrazyEights && !pool.isActive ? "leaderboard" : "picks");
  }, [isCrazyEights, pool?.id, pool?.isActive, requestedTab]);

  const poolRules = getPoolRules(pool);
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

  // Replay Mode status — polled for nfl_confidence pools in sandbox mode
  const { data: replayStatusData } = useQuery({
    queryKey: ["replay-status", poolId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const r = await fetch(`/api/pools/${poolId}/replay/status`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) return null;
      return r.json() as Promise<{ active: boolean; summary: { live: number; final: number; pending: number } }>;
    },
    enabled: (isNflConfidence || isNflConfidenceWeekly) && !!((pool as any)?.sandboxMode),
    refetchInterval: 30_000,
    staleTime: 25_000,
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
  if (pool && ((pool.poolType as string) === "pickem" || isNbaAts) && !location.endsWith("/pickem")) {
    return <Redirect to={`/pools/${poolId}/pickem`} replace />;
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
      
      <main className="flex-1 container px-4 py-4 md:py-8 max-w-7xl mx-auto">
        
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
                <div className="flex items-center gap-2">
                  <h1 className="font-bebas text-3xl md:text-6xl tracking-wide text-primary drop-shadow-sm mb-1 md:mb-2">{pool.name}</h1>
                  {poolRules && <PoolRulesSheet rules={poolRules} />}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveTab("leaderboard");
                      if (pool.poolType === "pickem_season") {
                        setPickemSeasonDetailedView(true);
                      }
                    }}
                    className={cn(
                      "h-8 shrink-0 gap-1.5 border-green-500/40 bg-green-500/5 px-2.5 text-xs text-green-400 hover:bg-green-500/10 hover:text-green-300",
                      hasPoolLeaderboardTab && "hidden md:inline-flex",
                    )}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Standings
                  </Button>
                </div>
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
                <div className="flex w-full max-w-full flex-row flex-wrap items-center gap-2 text-[10px] md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  <span className="inline-flex w-fit max-w-full items-center gap-1 bg-muted/50 px-2 py-1 rounded text-foreground">
                    <SportLogo sport={pool.sport} className="h-4 w-4 rounded-sm" />
                    {SPORT_LABELS[pool.sport] ?? pool.sport}
                  </span>
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
                  {((pool.poolType as string) === "pickem" || (pool.poolType as string) === "pickem_season" || isNbaAts) && (
                    <span className="flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded">
                      <Crosshair className="w-3 h-3" /> {isNbaAts ? "ATS · Weekly" : `Pick-Ems${(pool.poolType as string) === "pickem_season" ? " · Season" : (pool as any).pickFrequency ? ` · ${(pool as any).pickFrequency === "daily" ? "Daily" : "Weekly"}` : ""}`}
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
                  {isMlbBracket && (
                    <span className="flex items-center gap-1 bg-red-500/10 text-red-300 border border-red-500/20 px-2 py-1 rounded">
                      <Trophy className="w-3 h-3" /> MLB Postseason Bracket
                    </span>
                  )}
                  {isNdp && (
                    <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded">
                      <ListOrdered className="w-3 h-3" /> Division Predictor
                    </span>
                  )}
                  {isNhlNdp && (
                    <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded">
                      <ListOrdered className="w-3 h-3" /> NHL Division Predictor
                    </span>
                  )}
                  {isCrazyEights && (
                    <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded">
                      <Dice5 className="w-3 h-3" /> {pool.sport === "nhl" ? "Hit the Ice!" : "High Heat"}{(pool as any).pickFrequency ? ` · ${(pool as any).pickFrequency === "daily" ? "Daily" : "Weekly"}` : ""}
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
                  {isNhlNdp && (pool as any).sandboxMode && (
                    <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded font-bold tracking-widest text-[9px] uppercase">
                      <Zap className="w-2.5 h-2.5" /> Sandbox
                    </span>
                  )}
                  {(isNflConfidence || isNflConfidenceWeekly) && (pool as any).sandboxMode && replayStatusData?.active && (
                    <span className="flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded font-bold tracking-widest text-[9px] uppercase">
                      🎬 Replay
                    </span>
                  )}
                  <span className="inline-flex w-fit max-w-full items-center gap-1 text-muted-foreground">Season {pool.season}</span>
                  <span className="inline-flex w-fit max-w-full items-center gap-1 bg-muted/50 text-muted-foreground border border-border/50 px-2 py-1 rounded">
                    {pool.isRecurring ? <RefreshCw className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                    {pool.isRecurring ? "Recurring" : "One-time"}
                  </span>
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
                        {isNhlNdp ? pool.totalMembers : pool.activeCount}<span className="text-[10px] text-muted-foreground/60">/{pool.totalMembers}</span>
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
                      <Users className="w-3 h-3" /> {isNhlNdp ? "Entries" : "Alive"}
                    </div>
                    <div className="font-bebas text-3xl text-accent">
                      {isNhlNdp ? pool.totalMembers : pool.activeCount} <span className="text-xl text-muted-foreground/60">/ {pool.totalMembers}</span>
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
            {showsSeasonWeeklyBonus && pool.weeklyBonusLockedActive === false && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300">
                <XCircle className="h-5 w-5 shrink-0 text-amber-400" />
                <div className="text-sm font-bold">
                  {pool.weeklyBonusMinPlayers != null
                    ? `Weekly Bonus: OFF — fewer than ${pool.weeklyBonusMinPlayers} players are currently enrolled (${pool.totalMembers}/${pool.weeklyBonusMinPlayers})`
                    : "Weekly Bonus: OFF — the minimum enrollment is not configured"}
                </div>
              </div>
            )}

            {!pool.isActive && (pool as any).closureReason === "min_entries_not_met" && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
                <Ban className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-bebas text-xl tracking-wide text-destructive">Pool Cancelled</p>
                  <p className="text-sm text-muted-foreground">Minimum entries were not reached before the season started. No games were played.</p>
                </div>
              </div>
            )}

            {!pool.isActive && (pool as any).closureReason !== "min_entries_not_met" && (
              <PoolEndedResult poolId={pool.id} isRecurring={pool.isRecurring} />
            )}

            {isMlbBracket ? (
              <MlbPostseasonBracketView poolId={pool.id} isCommissioner={isCommissioner} inviteCode={pool.inviteCode} sandboxMode={(pool as any).sandboxMode ?? false} isActive={pool.isActive} poolName={pool.name} />
            ) : isPickEmSeason ? (
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
                weeklyBonusEnabled={pool.weeklyBonusEnabled === true}
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
                detailedView={pickemSeasonDetailedView}
                onDetailedViewChange={setPickemSeasonDetailedView}
              />
            ) : ((pool.poolType as string) === "pickem" || isNbaAts) ? (
              <PickEmView poolId={pool.id} poolName={pool.name} poolDescription={pool.description ?? ""} commissionerId={pool.commissionerId} inviteCode={pool.inviteCode} sport={pool.sport} pickFrequency={(pool as any).pickFrequency} isRecurring={pool.isRecurring} entryFee={pool.entryFee} />
            ) : isGsp ? (
              <GroupStagePredictorView poolId={pool.id} isCommissioner={isCommissioner} inviteCode={pool.inviteCode} />
            ) : isNdp ? (
              <NflDivisionPredictorView poolId={pool.id} isCommissioner={isCommissioner} inviteCode={pool.inviteCode} sandboxMode={(pool as any).sandboxMode ?? false} isSuperAdmin={user?.role === "admin"} />
            ) : isNhlNdp ? (
              <NhlDivisionPredictorView poolId={pool.id} isCommissioner={isCommissioner} inviteCode={pool.inviteCode} sandboxMode={(pool as any).sandboxMode ?? false} isSuperAdmin={user?.role === "admin"} />
            ) : isCrazyEights ? (
              <CrazyEightsPoolTabs
                pool={{
                  id: pool.id,
                  sport: pool.sport,
                  name: pool.name,
                  isActive: pool.isActive,
                  isRecurring: pool.isRecurring,
                  sandboxMode: (pool as any).sandboxMode ?? false,
                  pickFrequency: (pool as any).pickFrequency,
                }}
                userId={user?.id}
                isCommissioner={isCommissioner}
                isSuperAdmin={user?.role === "admin"}
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
              />
            ) : isNflConfidenceWeekly ? (
              <div className="space-y-4">
              <NflConfidenceWeeklyWinnerBanner poolId={pool.id} currentWeek={pool.currentWeek} />
               <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="relative">
                  <div>
                    <TabsList className="bg-transparent border-0 grid grid-cols-2 gap-1 h-auto p-1.5 shadow-sm w-full md:flex md:flex-wrap md:gap-1">
                      <TabsTrigger value="picks" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-primary/20 bg-primary/5 text-primary/70 hover:border-primary/40 hover:bg-primary/10 hover:text-primary font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 flex gap-2">
                        <Zap className="w-4 h-4 md:w-5 md:h-5" /> This Week's Picks
                      </TabsTrigger>
                      <TabsTrigger value="leaderboard" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-accent/20 bg-accent/5 text-accent/70 hover:border-accent/40 hover:bg-accent/10 hover:text-accent font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
                      </TabsTrigger>
                      <TabsTrigger value="grid" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-purple-500/20 bg-purple-500/5 text-purple-400/70 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 flex gap-2">
                        Weekly Grid
                      </TabsTrigger>
                      <TabsTrigger value="snapshot" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-cyan-500/20 bg-cyan-500/5 text-cyan-400/70 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 flex gap-2">
                        <Camera className="w-4 h-4 md:w-5 md:h-5" /> Snapshot
                      </TabsTrigger>
                      {isCommissioner && (
                        <TabsTrigger value="commissioner" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-amber-500/20 bg-amber-500/5 text-amber-400/70 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 md:ml-auto flex gap-2">
                          <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>
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
                        isActive={pool.isActive}
                      />
                    </TabsContent>
                  )}
                </div>
              </Tabs>
              </div>
            ) : isNflConfidence ? (
               <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="relative">
                  <div>
                    <TabsList className="bg-transparent border-0 grid grid-cols-2 gap-1 h-auto p-1.5 shadow-sm w-full md:flex md:flex-wrap md:gap-1">
                      <TabsTrigger value="picks" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-primary/20 bg-primary/5 text-primary/70 hover:border-primary/40 hover:bg-primary/10 hover:text-primary font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400 flex gap-2">
                        <Zap className="w-4 h-4 md:w-5 md:h-5" /> This Week's Picks
                      </TabsTrigger>
                      <TabsTrigger value="leaderboard" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-accent/20 bg-accent/5 text-accent/70 hover:border-accent/40 hover:bg-accent/10 hover:text-accent font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
                      </TabsTrigger>
                      <TabsTrigger value="grid" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-purple-500/20 bg-purple-500/5 text-purple-400/70 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 flex gap-2">
                        Weekly Grid
                      </TabsTrigger>
                      <TabsTrigger value="snapshot" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-cyan-500/20 bg-cyan-500/5 text-cyan-400/70 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 flex gap-2">
                        <Camera className="w-4 h-4 md:w-5 md:h-5" /> Snapshot
                      </TabsTrigger>
                      {isCommissioner && (
                        <TabsTrigger value="commissioner" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-amber-500/20 bg-amber-500/5 text-amber-400/70 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 md:ml-auto flex gap-2">
                          <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                </div>
                <div className="mt-8">
                  <TabsContent value="picks" className="m-0 focus-visible:outline-none">
              <NflConfidenceView
                poolId={pool.id}
                currentWeek={pool.currentWeek}
                weeklyBonusEnabled={pool.weeklyBonusEnabled === true}
              />
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
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="relative">
              <div>
              <TabsList className={POOL_TABS_LIST_CLASS}>
                <TabsTrigger
                  value="picks"
                  className={cn(
                    POOL_TAB_TRIGGER_BASE,
                    "border border-primary/20 bg-primary/5 text-primary/70 hover:border-primary/40 hover:bg-primary/10 hover:text-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary",
                  )}
                >
                  <Target className={POOL_TAB_ICON_CLASS} />
                  <span className="sm:hidden">Pick</span>
                  <span className="hidden sm:inline">Make Pick</span>
                </TabsTrigger>
                <TabsTrigger
                  value="leaderboard"
                  className={cn(
                    POOL_TAB_TRIGGER_BASE,
                    "border border-accent/20 bg-accent/5 text-accent/70 hover:border-accent/40 hover:bg-accent/10 hover:text-accent data-[state=active]:bg-accent/10 data-[state=active]:text-accent",
                  )}
                >
                  <Activity className={POOL_TAB_ICON_CLASS} />
                  <span className="sm:hidden">Board</span>
                  <span className="hidden sm:inline">Leaderboard</span>
                </TabsTrigger>
                <TabsTrigger
                  value="grid"
                  className={cn(
                    POOL_TAB_TRIGGER_BASE,
                    "border border-purple-500/20 bg-purple-500/5 text-purple-400/70 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400",
                  )}
                >
                  Grid
                </TabsTrigger>
                {isCommissioner && (
                  <TabsTrigger
                    value="commissioner"
                    className={cn(
                      POOL_TAB_TRIGGER_BASE,
                      "border border-amber-500/20 bg-amber-500/5 text-amber-400/70 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300 md:ml-auto",
                    )}
                  >
                    <ShieldAlert className={POOL_TAB_ICON_CLASS} />
                    <span className="sm:hidden">Comm.</span>
                    <span className="hidden sm:inline">Commissioner</span>
                  </TabsTrigger>
                )}
              </TabsList>
              </div>
            </div>

              <div className="mt-8">
                <TabsContent value="picks" className="m-0 focus-visible:outline-none">
                  {(pool as any).pickFrequency === "daily" ? (
                    <DailyPickGrid poolId={pool.id} />
                  ) : (
                    <MatchupPickGrid
                      poolId={pool.id}
                      sport={pool.sport as "nfl" | "mlb" | "nba" | "nhl" | "fifa"}
                      poolType={pool.poolType}
                      currentWeek={pool.currentWeek}
                      isActive={pool.isActive}
                      isEliminated={pool.members.find(m => m.userId === user?.id)?.status === "eliminated"}
                      eliminatedWeek={pool.members.find(m => m.userId === user?.id)?.eliminatedWeek ?? null}
                    />
                  )}
                </TabsContent>
                <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
                  {isNflSurvivor && <PickVisibilityNotice kind="survivor" />}
                  <Leaderboard poolId={pool.id} sport={pool.sport} poolType={pool.poolType} pickFrequency={(pool as any).pickFrequency} maxEntries={pool.maxEntries ?? undefined} totalMembers={pool.totalMembers} prizeMode={(pool as any).prizeMode ?? "fixed"} entryFee={pool.entryFee} />
                </TabsContent>
                <TabsContent value="grid" className="m-0 focus-visible:outline-none">
                  {isNflSurvivor && <PickVisibilityNotice kind="survivor" />}
                  <SurvivorGrid poolId={pool.id} poolName={pool.name} />
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
