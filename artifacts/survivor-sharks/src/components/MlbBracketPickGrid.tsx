import {
  getGetMlbBracketGridQueryKey,
  useGetMlbBracketGrid,
} from "@workspace/api-client-react";
import type { MlbBracketGridMembersItem } from "@workspace/api-client-react";
import { Check, Clock3, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMlbBracketPickVisualState } from "@/lib/mlbBracketPickState";

const SLOT_LABELS: Record<string, string> = {
  AL_WC_1: "AL WC1",
  AL_WC_2: "AL WC2",
  NL_WC_1: "NL WC1",
  NL_WC_2: "NL WC2",
  AL_DS_1: "AL DS1",
  AL_DS_2: "AL DS2",
  NL_DS_1: "NL DS1",
  NL_DS_2: "NL DS2",
  ALCS: "ALCS",
  NLCS: "NLCS",
  WORLD_SERIES: "World Series",
};

export function MlbBracketPickGrid({ poolId, onSelectMember }: { poolId: number; onSelectMember: (member: MlbBracketGridMembersItem) => void }) {
  const { data, isLoading, isError } = useGetMlbBracketGrid(poolId, {
    query: {
      queryKey: getGetMlbBracketGridQueryKey(poolId),
      staleTime: 0,
    },
  });

  if (isLoading) return <Skeleton className="h-80 w-full rounded-xl" />;
  if (isError || !data) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">The pick grid becomes available once the bracket locks.</CardContent></Card>;
  if (!data.members.length) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No pool members are available.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bebas text-3xl tracking-wider">Postseason Pick Grid</h2>
          <p className="text-sm text-muted-foreground">{data.members.length} player{data.members.length === 1 ? "" : "s"} · all 11 series</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wider">
          <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3 w-3" />Correct</span>
          <span className="inline-flex items-center gap-1 text-red-400"><X className="h-3 w-3" />Incorrect</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock3 className="h-3 w-3" />Alive</span>
          <span className="text-muted-foreground/50">Grey = eliminated</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
        <table className="w-full min-w-[1050px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-40 border-b border-r border-border/40 bg-card px-3 py-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Player</th>
              {data.series.map(series => (
                <th key={series.seriesId} className="min-w-[78px] border-b border-r border-border/30 bg-card px-2 py-3 text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wide">{SLOT_LABELS[series.seriesId] ?? series.seriesId}</span>
                  <span className="mt-0.5 block text-[8px] font-normal uppercase tracking-wide text-muted-foreground">{series.roundLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.members.map(member => (
              <tr key={member.userId} className="group hover:bg-muted/5">
                <td className="sticky left-0 z-10 border-b border-r border-border/30 bg-card p-0 group-hover:bg-muted/10">
                  <button type="button" onClick={() => onSelectMember(member)} data-testid={`button-mlb-grid-member-${member.userId}`} className="w-full px-3 py-3 text-left font-semibold hover:text-primary">
                    <span className="block max-w-36 truncate">{member.displayName ?? member.username}</span>
                    <span className="mt-0.5 block text-[9px] font-normal uppercase tracking-wide text-muted-foreground">View results</span>
                  </button>
                </td>
                {data.series.map((series, index) => {
                  const pick = member.picks[index];
                  const visualState = getMlbBracketPickVisualState({
                    winnerCorrect: pick?.winnerCorrect ?? null,
                    seriesCompleted: series.completed,
                    predictedTeamEliminated: pick?.predictedTeamEliminated ?? false,
                  });
                  return (
                    <td key={series.seriesId} className="border-b border-r border-border/20 p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onSelectMember(member)}
                        title={pick ? `${pick.predictedWinner} in ${pick.predictedLength}` : "No pick"}
                        className={cn(
                          "mx-auto flex min-h-11 w-full items-center justify-center rounded-md border px-1.5 font-mono text-xs font-bold transition-colors",
                          !pick && "border-transparent text-muted-foreground/35",
                          pick && visualState === "alive" && "border-primary/20 bg-primary/5 text-foreground hover:border-primary/40",
                          visualState === "correct" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                          visualState === "incorrect" && "border-red-500/25 bg-red-500/10 text-red-400",
                          visualState === "processing" && "border-amber-500/25 bg-amber-500/10 text-amber-300",
                          visualState === "eliminated" && "border-border/20 bg-muted/20 text-muted-foreground/40 grayscale",
                        )}
                      >
                        {pick ? `${pick.teamAbbreviation}-${pick.predictedLength}` : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}