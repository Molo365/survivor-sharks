import { useListPastPools, getListPastPoolsQueryKey, ApiError } from "@workspace/api-client-react";
import { NavBar } from "@/components/NavBar";
import { PastPoolCard } from "@/components/PastPoolCard";
import { Button } from "@/components/ui/button";
import { History, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/AdSlot";
import { Link } from "wouter";

export default function PastPools() {
  const { data: pastPools, isLoading, error } = useListPastPools({
    query: {
      queryKey: getListPastPoolsQueryKey(),
      refetchInterval: 60 * 1000,
    },
  });

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="font-bebas text-4xl tracking-wide text-foreground">PAST POOLS</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-wider">
              Pools you&apos;ve participated in
            </p>
          </div>
          <Link href="/profile">
            <Button variant="outline" size="sm" className="gap-2 border-primary/30 hover:bg-primary/10 hover:text-primary">
              <History className="w-3.5 h-3.5" />
              Profile History
            </Button>
          </Link>
        </div>

        {error ? (
          error instanceof ApiError && error.status === 401 ? (
            <div className="p-6 text-center border border-amber-500/20 bg-amber-500/10 rounded-lg space-y-3">
              <p className="font-semibold text-amber-400">Your session has expired</p>
              <p className="text-sm text-muted-foreground">Please log in again to continue.</p>
              <Link href="/login">
                <Button size="sm">Log In</Button>
              </Link>
            </div>
          ) : (
            <div className="p-6 text-center border border-destructive/20 bg-destructive/10 rounded-lg text-destructive">
              Failed to load past pools. Please try again later.
            </div>
          )
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
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
        ) : pastPools && pastPools.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pastPools.map((pool) => (
              <PastPoolCard key={pool.id} pool={pool} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 rounded-lg bg-card/30">
            <Info className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="font-bebas text-2xl tracking-wide mb-2">NO PAST POOLS</h2>
            <p className="text-muted-foreground max-w-md">
              Pools you&apos;ve completed will appear here.
            </p>
          </div>
        )}

        <div className="mt-12">
          <AdSlot />
        </div>
      </main>
    </div>
  );
}