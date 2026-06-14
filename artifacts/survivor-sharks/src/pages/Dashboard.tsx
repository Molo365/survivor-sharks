import { useListPools, useGetPickEmDashboardStats, getGetPickEmDashboardStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { NavBar } from "@/components/NavBar";
import { PoolCard } from "@/components/PoolCard";
import { Button } from "@/components/ui/button";
import { Plus, UserPlus, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/AdSlot";
import underwaterBg from "@assets/Underwater_1781045385578.jpg";

export default function Dashboard() {
  const { data: pools, isLoading, error } = useListPools();
  const { data: pickEmStats } = useGetPickEmDashboardStats({ query: { queryKey: getGetPickEmDashboardStatsQueryKey(), staleTime: 2 * 60 * 1000 } });
  const pickEmStatMap = new Map((pickEmStats ?? []).map((s) => [s.poolId, s]));

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Fixed background: image + dark overlay */}
      <div
        style={{
          backgroundImage: `url(${underwaterBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
        className="fixed inset-0 -z-10"
      />
      <div className="fixed inset-0 -z-10 bg-black/65" />
      <NavBar />
      
      <main className="flex-1 container px-4 py-8 max-w-6xl mx-auto">
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

        {error ? (
          <div className="p-6 text-center border border-destructive/20 bg-destructive/10 rounded-lg text-destructive">
            Failed to load pools. Please try again later.
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-lg border border-border/50 bg-card/50 p-6 space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map(pool => (
              <PoolCard key={pool.id} pool={pool} pickEmStat={pickEmStatMap.get(pool.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 rounded-lg bg-card/30">
            <Info className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-bebas text-2xl tracking-wide mb-2">NO POOLS YET</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              You haven't joined or created any pools. Get started by joining an existing pool with an invite code or create your own to invite friends.
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
        
        <AdSlot />
      </main>
    </div>
  );
}
