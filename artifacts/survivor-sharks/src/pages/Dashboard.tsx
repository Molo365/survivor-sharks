import { useListPools, useListPastPools, useGetPickEmDashboardStats, getGetPickEmDashboardStatsQueryKey, getListPoolsQueryKey, getListPastPoolsQueryKey } from "@workspace/api-client-react";
import type { PastPool } from "@workspace/api-client-react";
import { Link } from "wouter";
import { NavBar } from "@/components/NavBar";
import { PoolCard } from "@/components/PoolCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, UserPlus, Info, ChevronRight, Trophy, Users, Calendar, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/AdSlot";

function formatEndedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function PastPoolCard({ pool }: { pool: PastPool }) {
  return (
    <Link href={`/pools/${pool.id}`} className="block h-full group" data-testid={`card-past-pool-${pool.id}`}>
      <Card className="shark-card h-full flex flex-col hover:border-primary/50 transition-all duration-300 opacity-75 hover:opacity-90">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="font-bebas text-2xl truncate text-foreground/80">{pool.name}</CardTitle>
            <Badge variant="secondary">Ended</Badge>
          </div>
          <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
            {pool.sport} • Season {pool.season}
          </div>
        </CardHeader>
        <CardContent className="pb-4 flex-grow space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="w-4 h-4 text-primary/60" />
              <span>{pool.memberCount} members</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4 text-primary/60" />
              <span>Week {pool.currentWeek}</span>
            </div>
          </div>

          {pool.winnerName && (
            <div className="flex items-center gap-1.5 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground">Winner:</span>
              <span className="font-medium text-amber-400">{pool.winnerName}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Clock className="w-3 h-3" />
            <span>Ended {formatEndedDate(pool.endedAt)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data: pools, isLoading, error } = useListPools({ query: { queryKey: getListPoolsQueryKey(), refetchInterval: 60 * 1000 } });
  const { data: pastPools, isLoading: isPastLoading } = useListPastPools({ query: { queryKey: getListPastPoolsQueryKey(), refetchInterval: 60 * 1000 } });
  const { data: pickEmStats } = useGetPickEmDashboardStats({ query: { queryKey: getGetPickEmDashboardStatsQueryKey(), staleTime: 2 * 60 * 1000, refetchInterval: 60 * 1000 } });
  const pickEmStatMap = new Map((pickEmStats ?? []).map((s) => [s.poolId, s]));

  const hasPastPools = (pastPools?.length ?? 0) > 0;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div
        style={{
          backgroundImage: `url('/ocean_shark_bg.jpg')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
        className="fixed inset-0 -z-10"
      />
      <div className="fixed inset-0 -z-10 bg-black/65" />
      <NavBar />
      
      <main className="flex-1 container px-4 py-8 max-w-6xl mx-auto">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="font-bebas text-4xl tracking-wide text-foreground">MY POOLS</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-wider">Manage your survivor leagues</p>
          </div>
          
          <div className="flex gap-3 w-full sm:w-auto">
            <Link href="/pools/join" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full gap-2 border-primary/30 hover:bg-primary/10 hover:text-primary transition-colors" data-testid="button-join-pool">
                <UserPlus className="w-4 h-4" /> Join Pool
              </Button>
            </Link>
            <Link href="/pools/new" className="flex-1 sm:flex-none">
              <Button className="w-full gap-2 font-bebas text-lg tracking-wider" data-testid="button-create-pool">
                <Plus className="w-4 h-4" /> Create Pool
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Active lobby ── */}
        {error ? (
          <div className="p-6 text-center border border-destructive/20 bg-destructive/10 rounded-lg text-destructive">
            Failed to load pools. Please try again later.
          </div>
        ) : isLoading ? (
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:mx-0 md:px-0">
            {[1, 2, 3].map(i => (
              <div key={i} className="shrink-0 snap-start w-[85vw] md:w-auto h-48 rounded-lg border border-border/50 bg-card/50 p-6 space-y-4">
                <div className="flex justify-between">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <Skeleton className="h-4 w-1/4" />
                <div className="space-y-2 pt-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : pools && pools.length > 0 ? (
          <div className="relative">
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:mx-0 md:px-0">
              {pools.map(pool => (
                <div key={pool.id} className="shrink-0 snap-start w-[85vw] md:w-auto">
                  <PoolCard pool={pool} pickEmStat={pickEmStatMap.get(pool.id)} />
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/50 to-transparent flex items-center justify-end pr-1 md:hidden">
              <ChevronRight className="w-5 h-5 text-white/60" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 rounded-lg bg-card/30">
            <Info className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-bebas text-2xl tracking-wide mb-2">NO ACTIVE POOLS</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              You haven't joined or created any active pools. Get started by joining an existing pool with an invite code or create your own to invite friends.
            </p>
            <div className="flex gap-4">
              <Link href="/pools/join">
                <Button variant="outline" data-testid="button-empty-join">Join a Pool</Button>
              </Link>
              <Link href="/pools/new">
                <Button data-testid="button-empty-create">Create Pool</Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Past Pools ── */}
        {(hasPastPools || isPastLoading) && (
          <div className="mt-12">
            <div className="mb-4">
              <h2 className="font-bebas text-2xl tracking-wide text-foreground/70">PAST POOLS</h2>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">Pools that ended more than 2 days ago — available for 30 days</p>
            </div>

            {isPastLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2].map(i => (
                  <div key={i} className="h-36 rounded-lg border border-border/30 bg-card/30 p-5 space-y-3">
                    <div className="flex justify-between">
                      <Skeleton className="h-7 w-3/4 opacity-40" />
                      <Skeleton className="h-5 w-14 opacity-40" />
                    </div>
                    <Skeleton className="h-3 w-1/3 opacity-30" />
                    <Skeleton className="h-3 w-1/2 opacity-30" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(pastPools ?? []).map(pool => (
                  <PastPoolCard key={pool.id} pool={pool} />
                ))}
              </div>
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
