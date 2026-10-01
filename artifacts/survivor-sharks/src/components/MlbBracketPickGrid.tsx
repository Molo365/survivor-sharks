import {
  getGetMlbBracketGridQueryKey,
  useGetMlbBracketGrid,
} from "@workspace/api-client-react";
import type { MlbBracketGridMembersItem } from "@workspace/api-client-react";
import { Check, Clock3, Download, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMlbBracketPickVisualState } from "@/lib/mlbBracketPickState";
import { downloadGridPdf } from "@/lib/downloadGridPdf";

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

export function MlbBracketPickGrid({ poolId, onSelectMember, poolName = "MLB Postseason Bracket" }: { poolId: number; onSelectMember: (member: MlbBracketGridMembersItem) => void; poolName?: string }) {
  const { data, isLoading, isError } = useGetMlbBracketGrid(poolId, {
    query: {
      queryKey: getGetMlbBracketGridQueryKey(poolId),
      staleTime: 0,
    },
  });

  if (isLoading) return <Skeleton className="h-80 w-full rounded-xl" />;
  if (isError || !data) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">The pick grid becomes available once the bracket locks.</CardContent></Card>;
  if (!data.members.length) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No pool members are available.</CardContent></Card>;

  const gridData = data;

  function handleDownloadPdf() {
    const sortedMembers = [...gridData.members].sort((a, b) => b.points - a.points);
    const columns = ["Player", ...gridData.series.map(series => SLOT_LABELS[series.seriesId] ?? series.seriesId), "Points"];
    const rows = sortedMembers.map(member => {
      const pickCells = gridData.series.map((_, index) => {
        const pick = member.picks[index];
        return pick ? `${pick.teamAbbreviation}-${pick.predictedLength}` : "—";
      });
      return { cells: [member.displayName ?? member.username, ...pickCells, String(member.points)] };
    });
    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    downloadGridPdf({
      filename: `${poolName.replace(/\s+/g, "_")}_pick_grid.pdf`,
      poolName,
      sport: `MLB · Postseason ${new Date().getFullYear()}`,
      subtitle: `Pick Grid · ${gridData.members.length} player${gridData.members.length === 1 ? "" : "s"} · ${gridData.series.length} series`,
      columns,
      rows,
      footer: `Green = correct · Red = incorrect · Amber = awaiting result · Grey = eliminated · Cell = team and predicted series length · Points = 1/2/3/4 for the right winner (Wild Card/Division/Championship/World Series) + 1 for the exact series length · ${today}`,
      cellColorFn: (rowIdx, colIdx) => {
        const seriesIndex = colIdx - 1;
        const pick = sortedMembers[rowIdx]?.picks[seriesIndex];
        if (!pick) return null;
        const series = gridData.series[seriesIndex];
        if (!series) return null;
        const state = getMlbBracketPickVisualState({
          winnerCorrect: pick.winnerCorrect ?? null,
          seriesCompleted: series.completed,
          predictedTeamEliminated: pick.predictedTeamEliminated ?? false,
        });
        if (state === "correct") return [220, 252, 231];
        if (state === "incorrect") return [254, 226, 226];
        if (state === "processing") return [254, 243, 199];
        if (state === "eliminated") return [229, 231, 235];
        return null;
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bebas text-3xl tracking-wider">Postseason Pick Grid</h2>
          <p className="text-sm text-muted-foreground">{data.members.length} player{data.members.length === 1 ? "" : "s"} · all 11 series</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3 w-3" />Correct</span>
            <span className="inline-flex items-center gap-1 text-red-400"><X className="h-3 w-3" />Incorrect</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock3 className="h-3 w-3" />Alive</span>
            <span className="text-muted-foreground/50">Grey = eliminated</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} data-testid="button-mlb-grid-download-pdf" className="font-bebas text-base tracking-wider gap-1.5 h-8"><Download className="w-4 h-4" /> Download PDF</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
        <table className="w-full min-w-[1050px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-40 border-b border-r border-border/40 bg-card px-3 py-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Player</th>
              {data.series.map(series => (
                  <th key={series.seriesId} className="min-w-[118px] border-b border-r border-border/30 bg-card px-2 py-3 text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wide">{SLOT_LABELS[series.seriesId] ?? series.seriesId}</span>
                  <span className="mt-0.5 block text-[8px] font-normal uppercase tracking-wide text-muted-foreground">{series.roundLabel}</span>
                    {!series.completed &&
                      series.team1 &&
                      series.team2 &&
                      series.team1Wins != null &&
                      series.team2Wins != null &&
                      series.team1Wins + series.team2Wins > 0 && (
                        <>
                          <span className="mt-1 block text-[8px] font-medium uppercase tracking-wide text-muted-foreground">SERIES</span>
                          <div
                            className="mt-1 space-y-0.5 text-left text-[9px] font-medium normal-case tracking-normal text-muted-foreground"
                            aria-label={`${series.team1} ${series.team1Wins} wins, ${series.team2} ${series.team2Wins} wins`}
                          >
                            <div className="flex items-center justify-between gap-1" title={series.team1}>
                              <span className={`truncate ${series.team1Wins > series.team2Wins ? "text-primary" : ""}`}>{series.team1}</span>
                              <span className={`shrink-0 font-mono tabular-nums ${series.team1Wins > series.team2Wins ? "text-primary" : "text-foreground"}`}>{series.team1Wins}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1" title={series.team2}>
                              <span className={`truncate ${series.team2Wins > series.team1Wins ? "text-primary" : ""}`}>{series.team2}</span>
                              <span className={`shrink-0 font-mono tabular-nums ${series.team2Wins > series.team1Wins ? "text-primary" : "text-foreground"}`}>{series.team2Wins}</span>
                            </div>
                          </div>
                        </>
                      )}
                    {series.completed &&
                      series.team1 &&
                      series.team2 &&
                      series.team1Wins != null &&
                      series.team2Wins != null &&
                      series.team1Wins !== series.team2Wins && (
                        <>
                          <span className="mt-1 block text-[8px] font-medium uppercase tracking-wide text-muted-foreground">SERIES</span>
                          <div
                            className="mt-1 break-words text-center text-[9px] font-medium normal-case tracking-normal text-muted-foreground"
                            aria-label={`${series.team1Wins > series.team2Wins ? series.team1 : series.team2} won the series ${series.team1Wins > series.team2Wins ? series.team1Wins : series.team2Wins} to ${series.team1Wins > series.team2Wins ? series.team2Wins : series.team1Wins}`}
                            title={`${series.team1Wins > series.team2Wins ? series.team1 : series.team2} won the series ${series.team1Wins > series.team2Wins ? series.team1Wins : series.team2Wins} to ${series.team1Wins > series.team2Wins ? series.team2Wins : series.team1Wins}`}
                          >
                            <span className="text-primary">{series.team1Wins > series.team2Wins ? series.team1 : series.team2}</span>{" "}
                            win series{" "}
                            {series.team1Wins > series.team2Wins ? series.team1Wins : series.team2Wins}-
                            {series.team1Wins > series.team2Wins ? series.team2Wins : series.team1Wins}
                          </div>
                        </>
                      )}
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