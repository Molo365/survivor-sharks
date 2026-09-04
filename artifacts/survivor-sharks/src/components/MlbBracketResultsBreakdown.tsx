import type { MlbBracketResultBreakdownItem } from "@workspace/api-client-react";
import { Check, Clock3, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getMlbBracketPickVisualState } from "@/lib/mlbBracketPickState";

const ROUND_ORDER = ["wild_card", "division_series", "league_championship", "world_series"];
const ROUND_LABELS: Record<string, string> = {
  wild_card: "Wild Card",
  division_series: "Division Series",
  league_championship: "League Championship",
  world_series: "World Series",
};

function ResultIndicator({ value, pendingLabel }: { value: boolean | null; pendingLabel: string }) {
  if (value === null) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{pendingLabel}</span>;
  }
  return value
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><Check className="h-3.5 w-3.5" />Correct</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400"><X className="h-3.5 w-3.5" />Incorrect</span>;
}

export function MlbBracketResultsBreakdown({ rows }: { rows: MlbBracketResultBreakdownItem[] }) {
  const submitted = rows.some(row => row.predictedWinner !== null);
  if (!submitted) {
    return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No submitted bracket is available.</CardContent></Card>;
  }

  const totalPoints = rows.reduce((sum, row) => sum + row.pointsEarned, 0);
  const totalPossible = rows.reduce((sum, row) => sum + row.possiblePoints, 0);
  const correctLengths = rows.filter(row => row.lengthCorrect === true).length;
  const gradedSeries = rows.filter(row => row.actualWinner !== null).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-primary/25 bg-primary/5"><CardContent className="p-3 text-center"><p className="font-bebas text-2xl text-primary">{totalPoints}/{totalPossible}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-3 text-center"><p className="font-bebas text-2xl">{correctLengths}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lengths</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-3 text-center"><p className="font-bebas text-2xl">{gradedSeries}/11</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resolved</p></CardContent></Card>
      </div>

      {ROUND_ORDER.map(round => {
        const roundRows = rows.filter(row => row.round === round);
        if (!roundRows.length) return null;
        return (
          <section key={round}>
            <h3 className="mb-2 font-bebas text-lg tracking-wider text-muted-foreground">{ROUND_LABELS[round]}</h3>
            <div className="space-y-2">
              {roundRows.map(row => {
                const pending = row.actualWinner === null;
                const visualState = getMlbBracketPickVisualState({
                  winnerCorrect: row.winnerCorrect,
                  seriesCompleted: !pending,
                  predictedTeamEliminated: row.predictedTeamEliminated,
                });
                const eliminatedFuture = visualState === "eliminated";
                return (
                  <div key={row.seriesId} className={cn(
                    "rounded-xl border p-3",
                    visualState === "alive" && "border-primary/20 bg-card",
                    visualState === "eliminated" && "border-border/30 bg-muted/20 text-muted-foreground/50 grayscale",
                    visualState === "correct" && "border-emerald-500/25 bg-emerald-500/5",
                    visualState === "incorrect" && "border-red-500/20 bg-red-500/5",
                    visualState === "processing" && "border-amber-500/25 bg-amber-500/5",
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{row.seriesSlot.replaceAll("_", " ")}</p>
                        <p className="mt-1 font-semibold">{row.predictedWinner ?? "No pick"} <span className="font-normal text-muted-foreground">in {row.predictedLength ?? "—"}</span>{eliminatedFuture && <span className="ml-2 text-[9px] uppercase tracking-wider">Eliminated</span>}{visualState === "processing" && <span className="ml-2 text-[9px] uppercase tracking-wider text-amber-300">Processing</span>}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("font-bebas text-xl", row.pointsEarned > 0 ? "text-primary" : "text-muted-foreground")}>{row.pointsEarned}/{row.possiblePoints}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">points</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 border-t border-border/30 pt-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actual winner</p>
                        <div className="mt-1 flex items-center justify-between gap-2"><span className="text-sm">{row.actualWinner ?? "TBD"}</span><ResultIndicator value={row.winnerCorrect} pendingLabel="Pending" /></div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actual length</p>
                        <div className="mt-1 flex items-center justify-between gap-2"><span className="text-sm">{row.actualLength === null ? "TBD" : `${row.actualLength} games`}</span><ResultIndicator value={row.lengthCorrect} pendingLabel="Pending" /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}