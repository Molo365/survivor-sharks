import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Skull, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Leaderboard({ poolId }: { poolId: number }) {
  const { data: leaderboard, isLoading } = useGetLeaderboard(poolId, { query: { enabled: !!poolId, queryKey: getGetLeaderboardQueryKey(poolId) } });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;
  if (!leaderboard) return null;

  return (
    <div className="space-y-10">
      <div>
        <h3 className="font-bebas text-3xl text-primary flex items-center gap-3 mb-6 tracking-wide">
          <Activity className="w-7 h-7" /> THE SURVIVORS
        </h3>
        <div className="space-y-3">
          {leaderboard.active.map((entry, idx) => (
            <div key={entry.userId} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-card border border-border/50 rounded-lg hover:border-primary/50 transition-all shark-card">
              <div className="flex items-center gap-5 mb-3 sm:mb-0">
                <div className="font-bebas text-3xl text-primary/40 w-8 text-center">{idx + 1}</div>
                <div className="font-medium text-xl">{entry.displayName || entry.username}</div>
              </div>
              <div className="flex items-center gap-4 ml-13 sm:ml-0">
                {entry.lastPickTeam && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="uppercase text-xs tracking-wider">Latest Pick:</span>
                    <span className="font-medium text-foreground bg-muted/30 px-2 py-1 rounded">{entry.lastPickTeam}</span>
                  </div>
                )}
                <Badge className="bg-accent/10 text-accent border border-accent/30 font-bebas text-lg px-4 py-1 tracking-wider">ALIVE</Badge>
              </div>
            </div>
          ))}
          {leaderboard.active.length === 0 && (
            <div className="text-muted-foreground p-8 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
              No active members remain.
            </div>
          )}
        </div>
      </div>

      {leaderboard.eliminated.length > 0 && (
        <div>
          <h3 className="font-bebas text-3xl text-destructive flex items-center gap-3 mb-6 tracking-wide">
            <Skull className="w-7 h-7" /> THE FALLEN
          </h3>
          <div className="space-y-3">
            {leaderboard.eliminated.map((entry, idx) => (
              <div key={entry.userId} className="flex items-center justify-between p-5 bg-destructive/5 border border-destructive/20 rounded-lg opacity-80">
                <div className="flex items-center gap-5">
                  <div className="font-bebas text-2xl text-muted-foreground/50 w-8 text-center">{leaderboard.active.length + idx + 1}</div>
                  <div className="font-medium text-lg line-through text-muted-foreground flex items-center gap-2">
                    {entry.displayName || entry.username}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2 text-destructive font-bebas text-lg tracking-wider">
                    ELIMINATED WK {entry.eliminatedWeek}
                  </div>
                  {entry.lastPickTeam && (
                    <div className="text-xs text-muted-foreground">
                      Fatal Pick: <span className="font-medium text-foreground/70">{entry.lastPickTeam}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
