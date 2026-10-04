import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Camera, Dice5, ShieldAlert } from "lucide-react";
import { CrazyEightsView } from "@/components/CrazyEightsView";
import { CrazyEightsGrid } from "@/components/CrazyEightsGrid";
import { CrazyEightsLeaderboard } from "@/components/CrazyEightsLeaderboard";
import { CrazyEightsSnapshotView } from "@/components/CrazyEightsSnapshotView";
import { CommissionerPanel } from "@/components/CommissionerPanel";
import { PickPeriodBar, type PickPeriodListResponse } from "@/components/PickPeriodBar";

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("Request failed");
    return r.json() as Promise<T>;
  });
}

type PoolSlice = {
  id: number;
  sport: string;
  name: string;
  isActive: boolean;
  isRecurring: boolean;
  sandboxMode?: boolean;
  pickFrequency?: string;
};

export function CrazyEightsPoolTabs({
  pool,
  userId,
  isCommissioner,
  isSuperAdmin,
  activeTab,
  onActiveTabChange,
}: {
  pool: PoolSlice;
  userId: number | undefined;
  isCommissioner: boolean;
  isSuperAdmin: boolean;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
}) {
  const sandboxMode = pool.sandboxMode ?? false;
  const isWeekendSport = pool.sport === "nhl" || pool.sport === "nba";
  const isPeriodHistory = pool.isRecurring && !sandboxMode && isWeekendSport;
  const [selectedPeriodStart, setSelectedPeriodStart] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPeriodStart(null);
  }, [pool.id]);

  const { data: periodList } = useQuery({
    queryKey: ["crazy-eights-periods", pool.id],
    queryFn: () => authedFetch<PickPeriodListResponse>(`/api/pools/${pool.id}/crazy-eights/periods`),
    enabled: isPeriodHistory && userId != null,
    staleTime: 5 * 60 * 1000,
  });

  const activePeriodStart =
    selectedPeriodStart
    ?? periodList?.defaultKey
    ?? periodList?.periods.find((p) => p.status === "current")?.key
    ?? undefined;

  const viewingPastPeriod = useMemo(() => {
    if (!isPeriodHistory || !periodList?.periods.length || !activePeriodStart) return false;
    const match = periodList.periods.find((period) => period.key === activePeriodStart);
    return match?.status !== "current";
  }, [isPeriodHistory, periodList, activePeriodStart]);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={onActiveTabChange} className="w-full">
        <div className="relative">
          <TabsList className="bg-transparent border-0 grid grid-cols-2 gap-1 h-auto p-1.5 shadow-sm w-full md:flex md:flex-wrap md:gap-1">
            <TabsTrigger value="picks" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-primary/20 bg-primary/5 text-primary/70 hover:border-primary/40 hover:bg-primary/10 hover:text-primary font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400 flex gap-2">
              <Dice5 className="w-4 h-4 md:w-5 md:h-5" /> {pool.sport === "nhl" ? "Weekend Picks" : "Today's Picks"}
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-accent/20 bg-accent/5 text-accent/70 hover:border-accent/40 hover:bg-accent/10 hover:text-accent font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2">
              <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="grid" className="w-full md:flex-1 md:min-w-0 rounded-full truncate border border-purple-500/20 bg-purple-500/5 text-purple-400/70 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400 font-bebas text-sm md:text-xl tracking-wider px-4 md:px-5 py-2.5 md:py-2.5 flex gap-2">
              {pool.sport === "nhl" ? "Weekend Grid" : "Daily Grid"}
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

        {isPeriodHistory && (
          <PickPeriodBar
            periods={periodList?.periods ?? []}
            activeKey={activePeriodStart}
            onChange={setSelectedPeriodStart}
            viewingPast={viewingPastPeriod}
            periodLabel="Week"
          />
        )}

        <div className="mt-8">
          <TabsContent value="picks" className="m-0 focus-visible:outline-none">
            <CrazyEightsView
              poolId={pool.id}
              sport={pool.sport}
              pickFrequency={pool.pickFrequency ?? "daily"}
              poolName={pool.name}
              isActive={pool.isActive}
              periodStart={isPeriodHistory ? activePeriodStart : undefined}
              viewingPastPeriod={viewingPastPeriod}
            />
          </TabsContent>
          <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
            <CrazyEightsLeaderboard
              poolId={pool.id}
              sport={pool.sport}
              sandboxMode={sandboxMode}
              defaultToPreviousWeek={!pool.isActive}
              poolIsActive={pool.isActive}
              periodStart={isPeriodHistory ? activePeriodStart : undefined}
              usePeriodSelector={isPeriodHistory}
            />
          </TabsContent>
          <TabsContent value="grid" className="m-0 focus-visible:outline-none">
            <CrazyEightsGrid
              poolId={pool.id}
              sport={pool.sport}
              sandboxMode={sandboxMode}
              periodStart={isPeriodHistory ? activePeriodStart : undefined}
              usePeriodSelector={isPeriodHistory}
            />
          </TabsContent>
          <TabsContent value="snapshot" className="m-0 focus-visible:outline-none">
            <CrazyEightsSnapshotView
              poolId={pool.id}
              currentUserId={userId ?? null}
              poolName={pool.name}
              sport={pool.sport}
              sandboxMode={sandboxMode}
              periodStart={isPeriodHistory ? activePeriodStart : undefined}
            />
          </TabsContent>
          {isCommissioner && (
            <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
              <CommissionerPanel poolId={pool.id} isSuperAdmin={isSuperAdmin} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
