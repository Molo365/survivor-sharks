import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Dice5, LayoutGrid, ShieldAlert, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { POOL_TABS_LIST_CLASS, POOL_TAB_TRIGGER_BASE, POOL_TAB_ICON_CLASS } from "@/lib/poolTabStyles";
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
          <TabsList className={POOL_TABS_LIST_CLASS}>
            <TabsTrigger
              value="picks"
              className={cn(
                POOL_TAB_TRIGGER_BASE,
                "border border-purple-500/20 bg-purple-500/5 text-purple-400/70 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400",
              )}
            >
              <Dice5 className={POOL_TAB_ICON_CLASS} />
              <span className="sm:hidden">Picks</span>
              <span className="hidden sm:inline">
                {pool.sport === "nhl" ? "Weekend Picks" : "Today's Picks"}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="leaderboard"
              className={cn(
                POOL_TAB_TRIGGER_BASE,
                "border border-accent/20 bg-accent/5 text-accent/70 hover:border-accent/40 hover:bg-accent/10 hover:text-accent data-[state=active]:bg-accent/10 data-[state=active]:text-accent",
              )}
            >
              <Trophy className={POOL_TAB_ICON_CLASS} />
              <span className="sm:hidden">Board</span>
              <span className="hidden sm:inline">Leaderboard</span>
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              className={cn(
                POOL_TAB_TRIGGER_BASE,
                "border border-purple-500/20 bg-purple-500/5 text-purple-400/70 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400",
              )}
            >
              <LayoutGrid className={POOL_TAB_ICON_CLASS} />
              <span className="sm:hidden">Grid</span>
              <span className="hidden sm:inline">
                {pool.sport === "nhl" ? "Weekend Grid" : "Daily Grid"}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="snapshot"
              className={cn(
                POOL_TAB_TRIGGER_BASE,
                "border border-cyan-500/20 bg-cyan-500/5 text-cyan-400/70 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400",
              )}
            >
              <Camera className={POOL_TAB_ICON_CLASS} />
              <span className="sm:hidden">Snap</span>
              <span className="hidden sm:inline">Snapshot</span>
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

        {isPeriodHistory && (
          <PickPeriodBar
            periods={periodList?.periods ?? []}
            activeKey={activePeriodStart}
            onChange={setSelectedPeriodStart}
            viewingPast={viewingPastPeriod}
            periodLabel="Week"
          />
        )}

        <div className="mt-3 md:mt-8">
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
