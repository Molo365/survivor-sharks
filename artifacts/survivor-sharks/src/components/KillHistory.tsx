import { useGetEliminations, getGetEliminationsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull, AlertOctagon } from "lucide-react";
import { format } from "date-fns";

export function KillHistory({ poolId }: { poolId: number }) {
  const { data: eliminations, isLoading } = useGetEliminations(poolId, { query: { enabled: !!poolId, queryKey: getGetEliminationsQueryKey(poolId) } });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;
  if (!eliminations || eliminations.length === 0) return (
    <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
      <AlertOctagon className="w-16 h-16 text-muted-foreground/30 mb-6" />
      <h3 className="font-bebas text-3xl tracking-widest mb-3 text-muted-foreground/70">NO CASUALTIES YET</h3>
      <p className="text-muted-foreground text-lg">All sharks are still swimming in the deep end.</p>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {eliminations.map(elim => (
        <div key={`${elim.userId}-${elim.week}`} className="flex items-center justify-between p-5 bg-[linear-gradient(90deg,rgba(220,38,38,0.1)_0%,rgba(220,38,38,0.02)_100%)] border border-destructive/20 rounded-lg relative overflow-hidden group hover:border-destructive/40 transition-colors">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-destructive"></div>
          <div className="flex items-center gap-5 ml-3">
            <div className="w-14 h-14 rounded-full bg-background flex items-center justify-center border border-destructive/30 p-2 group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(220,38,38,0.2)]">
              {elim.teamLogoUrl ? (
                <img src={elim.teamLogoUrl} alt={elim.teamName} className="w-full h-full object-contain grayscale" />
              ) : (
                <Skull className="w-6 h-6 text-destructive/70" />
              )}
            </div>
            <div>
              <div className="font-bebas text-2xl text-destructive flex items-center gap-2 tracking-wide">
                {elim.displayName || elim.username} <Skull className="w-4 h-4 opacity-70" />
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <span className="uppercase text-[10px] tracking-widest font-bold">Fatal Pick</span> 
                <span className="text-foreground/80 font-medium">{elim.teamName}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bebas text-3xl text-muted-foreground/50 tracking-wider">WEEK {elim.week}</div>
            {elim.eliminatedAt && <div className="text-xs text-muted-foreground/60 mt-1 uppercase tracking-wider">{format(new Date(elim.eliminatedAt), 'MMM d, yyyy')}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
