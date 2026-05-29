import { useGetSurvivorGrid, getGetSurvivorGridQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull } from "lucide-react";
import { Card } from "@/components/ui/card";

export function SurvivorGrid({ poolId }: { poolId: number }) {
  const { data: grid, isLoading } = useGetSurvivorGrid(poolId, { query: { enabled: !!poolId, queryKey: getGetSurvivorGridQueryKey(poolId) } });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;
  if (!grid || !grid.weeks) return <div className="text-center p-8 text-muted-foreground">No grid data available yet.</div>;

  const sortedWeeks = [...grid.weeks].sort((a, b) => a - b);

  return (
    <Card className="bg-card border-border/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse min-w-max">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="p-4 font-bebas text-xl tracking-wide min-w-[200px] sticky left-0 bg-card z-10 border-r border-border/50">Shark</th>
              {sortedWeeks.map(w => (
                <th key={w} className="p-4 text-center font-bebas text-lg text-muted-foreground w-20 min-w-[80px]">Wk {w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.members.map((member, index) => (
              <tr key={member.userId} className={`border-b border-border/20 ${member.status === 'eliminated' ? 'bg-destructive/5' : index % 2 === 0 ? 'bg-card/50' : 'bg-transparent'} hover:bg-muted/20 transition-colors`}>
                <td className={`p-4 font-medium flex items-center gap-3 sticky left-0 z-10 border-r border-border/50 ${member.status === 'eliminated' ? 'bg-[#150a0a]' : 'bg-card'}`}>
                  {member.status === 'eliminated' && <Skull className="w-4 h-4 text-destructive flex-shrink-0" />}
                  <span className={`truncate ${member.status === 'eliminated' ? 'text-destructive line-through opacity-70' : 'text-foreground'}`}>
                    {member.displayName || member.username}
                  </span>
                </td>
                {sortedWeeks.map(w => {
                  const pick = grid.picks.find(p => p.userId === member.userId && p.week === w);
                  return (
                    <td key={w} className="p-2 text-center border-l border-border/10">
                      {pick ? (
                        <div className="flex justify-center">
                          <div className={`w-10 h-10 p-1.5 rounded-full border-2 bg-background flex items-center justify-center overflow-hidden
                            ${pick.result === 'win' ? 'border-accent shadow-[0_0_10px_rgba(57,255,20,0.2)]' : pick.result === 'loss' ? 'border-destructive opacity-50' : 'border-primary/50'}`}
                            title={`${pick.teamName} (${pick.result})`}
                          >
                            {pick.teamLogoUrl ? (
                              <img src={pick.teamLogoUrl} alt={pick.teamName} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-tighter">{pick.teamName.substring(0,3)}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="w-10 h-10 mx-auto rounded-full bg-muted/10 border border-dashed border-border/30 flex items-center justify-center text-muted-foreground/30 text-xs">
                          -
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
