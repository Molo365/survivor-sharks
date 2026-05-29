import { useGetPoolStats, getGetPoolStatsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Skull, Target, Activity } from "lucide-react";

export function PoolStats({ poolId }: { poolId: number }) {
  const { data: stats, isLoading } = useGetPoolStats(poolId, { query: { enabled: !!poolId, queryKey: getGetPoolStatsQueryKey(poolId) } });

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="shark-card bg-card border-border/50 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-5">
          <Users className="w-32 h-32" />
        </div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Sharks</CardTitle>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-bebas text-5xl text-primary tracking-wide">
            {stats.activeMembers} <span className="text-2xl text-muted-foreground/50">/ {stats.totalMembers}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Remaining in pool</p>
        </CardContent>
      </Card>
      
      <Card className="shark-card bg-card border-border/50 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-5">
          <Skull className="w-32 h-32" />
        </div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Casualties</CardTitle>
          <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
            <Skull className="w-4 h-4 text-destructive" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-bebas text-5xl text-destructive tracking-wide">{stats.eliminatedMembers}</div>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Total eliminated</p>
        </CardContent>
      </Card>
      
      <Card className="shark-card bg-card border-border/50 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-5">
          <Target className="w-32 h-32" />
        </div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Most Picked</CardTitle>
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-accent" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-bebas text-4xl text-accent truncate tracking-wide mt-1">{stats.mostPickedTeam || "N/A"}</div>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            {stats.mostPickedTeamCount ? `${stats.mostPickedTeamCount} picks this week` : "No picks yet"}
          </p>
        </CardContent>
      </Card>
      
      <Card className="shark-card bg-card border-border/50 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-5">
          <Activity className="w-32 h-32" />
        </div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Survival Rate</CardTitle>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-bebas text-5xl text-foreground tracking-wide">{stats.survivorPercentage ? `${stats.survivorPercentage}%` : "0%"}</div>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Overall pool survival</p>
        </CardContent>
      </Card>
    </div>
  );
}
