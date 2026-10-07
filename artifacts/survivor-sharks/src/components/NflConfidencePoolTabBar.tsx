import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, LayoutGrid, ShieldAlert, Trophy, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { POOL_TABS_LIST_CLASS, POOL_TAB_TRIGGER_BASE, POOL_TAB_ICON_CLASS } from "@/lib/poolTabStyles";

type Variant = "season" | "weekly";

export function NflConfidencePoolTabBar({
  isCommissioner,
  variant,
}: {
  isCommissioner: boolean;
  variant: Variant;
}) {
  const picksActive =
    variant === "weekly"
      ? "data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
      : "data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400";

  return (
    <TabsList className={POOL_TABS_LIST_CLASS}>
      <TabsTrigger
        value="picks"
        className={cn(
          POOL_TAB_TRIGGER_BASE,
          "border border-primary/20 bg-primary/5 text-primary/70 hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
          picksActive,
        )}
      >
        <Zap className={POOL_TAB_ICON_CLASS} />
        <span className="sm:hidden">Picks</span>
        <span className="hidden sm:inline">This Week&apos;s Picks</span>
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
        <span className="hidden sm:inline">Weekly Grid</span>
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
  );
}
