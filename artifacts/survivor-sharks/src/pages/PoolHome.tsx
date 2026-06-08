import { useParams, Link, useLocation, Redirect } from "wouter";
import { useGetPool, useGetPickEmLeaderboard, getGetPoolQueryKey, getGetPickEmLeaderboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { AdSlot } from "@/components/AdSlot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Target, Activity, Users, Skull, ShieldAlert, Trophy, RefreshCw, Zap, Bandage, Crosshair } from "lucide-react";
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

export default function PoolHome() {
  const { poolId: poolIdStr } = useParams();
  const poolId = parseInt(poolIdStr || "0");
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: pool, isLoading, error } = useGetPool(poolId, { query: { enabled: !!poolId, queryKey: getGetPoolQueryKey(poolId) } });

  const isPickEm = (pool?.poolType as string) === "pickem";
  const { data: pickemLeaderboard } = useGetPickEmLeaderboard(poolId, undefined, {
    query: {
      enabled: isPickEm && !!poolId,
      queryKey: getGetPickEmLeaderboardQueryKey(poolId),
    },
  });

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
        <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
        
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
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/50">
              <div>
                <h1 className="font-bebas text-5xl md:text-6xl tracking-wide text-primary drop-shadow-sm mb-2">{pool.name}</h1>
                <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground uppercase tracking-wider flex-wrap">
                  <span className="bg-muted/50 px-2 py-1 rounded text-foreground">{pool.sport}</span>
                  {pool.poolType === "season" && (
                    <span className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">
                      <Trophy className="w-3 h-3" /> Season
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
                  <span>Season {pool.season}</span>
                  {pool.sport !== "intl" && pool.sport !== "worldcup" && (
                    <span className="flex items-center gap-1 text-accent"><Activity className="w-4 h-4" /> Wk {pool.currentWeek}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
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
                {(pool as any).prizeStructure && (pool as any).prizeStructure.length > 0 ? (
                  <div className="bg-primary/5 border border-primary/20 px-5 py-3 rounded-lg shadow-[0_0_15px_rgba(30,144,255,0.05)] min-w-[120px]">
                    <div className="text-xs text-primary/80 uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> Prizes
                    </div>
                    <div className="space-y-0.5">
                      {((pool as any).prizeStructure as Array<{ place: number; amount: number }>).map((p) => (
                        <div key={p.place} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground text-xs">
                            {["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th"][p.place - 1]}
                          </span>
                          <span className="font-bebas text-base text-primary">${p.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : pool.prizePot && pool.prizePot > 0 ? (
                  <div className="bg-primary/5 border border-primary/20 px-5 py-3 rounded-lg text-center shadow-[0_0_15px_rgba(30,144,255,0.05)]">
                    <div className="text-xs text-primary/80 uppercase font-bold tracking-wider mb-1">Prize Pot</div>
                    <div className="font-bebas text-3xl text-primary">${pool.prizePot}</div>
                  </div>
                ) : null}
              </div>
            </div>

            {(pool.poolType as string) === "pickem" ? (
              <PickEmView poolId={pool.id} poolName={pool.name} commissionerId={pool.commissionerId} inviteCode={pool.inviteCode} sport={pool.sport} pickFrequency={(pool as any).pickFrequency} />
            ) : (
            <Tabs defaultValue="pick" className="w-full">
              <TabsList className="bg-card border border-border flex flex-wrap h-auto p-1.5 gap-1 shadow-sm">
                <TabsTrigger value="pick" className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2">
                  <Target className="w-5 h-5" /> Make Pick
                </TabsTrigger>
                <TabsTrigger value="leaderboard" className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
                  <Activity className="w-5 h-5" /> Leaderboard
                </TabsTrigger>
                <TabsTrigger value="grid" className="font-bebas text-xl tracking-wider px-5 py-2.5 flex gap-2">
                  Grid
                </TabsTrigger>
                <TabsTrigger value="history" className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive flex gap-2">
                  <Skull className="w-5 h-5" /> Kill History
                </TabsTrigger>
                <TabsTrigger value="stats" className="font-bebas text-xl tracking-wider px-5 py-2.5 flex gap-2">
                  Stats
                </TabsTrigger>
                <TabsTrigger value="injuries" className="font-bebas text-xl tracking-wider px-5 py-2.5 flex gap-2">
                  <Bandage className="w-5 h-5" /> Injuries
                </TabsTrigger>
                {isCommissioner && (
                  <TabsTrigger value="commissioner" className="font-bebas text-xl tracking-wider px-5 py-2.5 text-muted-foreground hover:text-foreground ml-auto flex gap-2">
                    <ShieldAlert className="w-5 h-5" /> Commissioner
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="mt-8">
                <TabsContent value="pick" className="m-0 focus-visible:outline-none">
                  {(pool as any).pickFrequency === "daily" ? (
                    <DailyPickGrid poolId={pool.id} />
                  ) : (
                    <MatchupPickGrid poolId={pool.id} sport={pool.sport as "nfl" | "mlb" | "nba" | "nhl" | "fifa"} currentWeek={pool.currentWeek} />
                  )}
                </TabsContent>
                <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
                  <Leaderboard poolId={pool.id} pickFrequency={(pool as any).pickFrequency} />
                </TabsContent>
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
                    <CommissionerPanel poolId={pool.id} />
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
