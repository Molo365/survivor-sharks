import type { MlbBracketResultBreakdownItem as ApiMlbBracketResultBreakdownItem } from "@workspace/api-client-react";
import { Check, Clock3, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BaseballLiveState } from "@/components/BaseballLiveState";
import { cn } from "@/lib/utils";
import { getMlbBracketPickVisualState } from "@/lib/mlbBracketPickState";

export type MlbBracketLiveGame = {
  awayTeam: { abbreviation: string; displayName: string; logo?: string };
  homeTeam: { abbreviation: string; displayName: string; logo?: string };
  awayScore: number | null;
  homeScore: number | null;
  liveState: {
    inning: number;
    isTopInning: boolean;
    outs: number;
    onFirst: boolean;
    onSecond: boolean;
    onThird: boolean;
    shortDetail: string | null;
  } | null;
};

export type MlbBracketResultBreakdownItem = ApiMlbBracketResultBreakdownItem & {
  team1?: string | null;
  team2?: string | null;
  team1Wins?: number | null;
  team2Wins?: number | null;
  liveGame?: MlbBracketLiveGame | null;
};

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

function inningLabel(liveGame: MlbBracketLiveGame): string {
  const state = liveGame.liveState;
  if (!state) return "Live";
  if (state.shortDetail) return state.shortDetail;
  const lastTwo = state.inning % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? "th"
    : state.inning % 10 === 1 ? "st" : state.inning % 10 === 2 ? "nd" : state.inning % 10 === 3 ? "rd" : "th";
  return `${state.isTopInning ? "Top" : "Bot"} ${state.inning}${suffix}`;
}

export function MlbBracketResultsBreakdown({ rows }: { rows: MlbBracketResultBreakdownItem[] }) {
  const submitted = rows.some(row => row.predictedWinner !== null);
  if (!submitted) {
    return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No submitted bracket is available.</CardContent></Card>;
  }

  const totalPoints = rows.reduce((sum, row) => sum + row.pointsEarned, 0);
  const totalPossible = rows.reduce((sum, row) => sum + row.possiblePoints, 0);
  const lengthBonusPoints = rows.filter(row => row.lengthCorrect === true).length;
  const gradedSeries = rows.filter(row => row.actualWinner !== null).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-primary/25 bg-primary/5"><CardContent className="p-3 text-center"><p className="font-bebas text-2xl text-primary">{totalPoints}/{totalPossible}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-3 text-center"><p className="font-bebas text-2xl">+{lengthBonusPoints}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Length bonus</p></CardContent></Card>
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
                const hasLiveScore = row.actualWinner === null &&
                  row.team1 != null &&
                  row.team2 != null &&
                  row.team1Wins != null &&
                  row.team2Wins != null &&
                  row.team1Wins + row.team2Wins > 0;
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
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Winner {row.winnerCorrect ? row.possiblePoints - 1 : 0} + length {row.lengthCorrect ? 1 : 0}
                        </p>
                      </div>
                    </div>
                    {hasLiveScore && (
                      <div
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-sm text-muted-foreground"
                        aria-label={`${row.team1} ${row.team1Wins} wins, ${row.team2} ${row.team2Wins} wins`}
                      >
                        {row.team1Wins! === row.team2Wins! ? (
                          <span className="text-sm text-muted-foreground">
                            Series tied{" "}
                            <span className="font-mono text-base font-bold tabular-nums text-foreground">{row.team1Wins}-{row.team2Wins}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            <span className="font-semibold text-primary">{row.team1Wins! > row.team2Wins! ? row.team1 : row.team2}</span>{" "}
                            lead series{" "}
                            <span className="font-mono text-base font-bold tabular-nums text-primary">
                              {row.team1Wins! > row.team2Wins! ? row.team1Wins : row.team2Wins}-{row.team1Wins! > row.team2Wins! ? row.team2Wins : row.team1Wins}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    {row.actualWinner === null && row.liveGame && (
                      <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2">
                        <div className="flex items-stretch gap-0">
                          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                            <span className="truncate text-xs font-semibold text-muted-foreground" title={row.liveGame.awayTeam.displayName}>
                              {row.liveGame.awayTeam.abbreviation}
                            </span>
                            <span className="font-mono text-base font-bold tabular-nums">
                              {row.liveGame.awayScore ?? "—"}
                            </span>
                          </div>
                          <div className="flex min-w-[72px] flex-col items-center justify-center gap-1 px-2">
                            <BaseballLiveState
                              detail={inningLabel(row.liveGame)}
                              bases={row.liveGame.liveState ? {
                                onFirst: row.liveGame.liveState.onFirst,
                                onSecond: row.liveGame.liveState.onSecond,
                                onThird: row.liveGame.liveState.onThird,
                              } : null}
                              outs={row.liveGame.liveState?.outs ?? null}
                            />
                          </div>
                          <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5">
                            <span className="font-mono text-base font-bold tabular-nums">
                              {row.liveGame.homeScore ?? "—"}
                            </span>
                            <span className="truncate text-xs font-semibold text-muted-foreground" title={row.liveGame.homeTeam.displayName}>
                              {row.liveGame.homeTeam.abbreviation}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
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