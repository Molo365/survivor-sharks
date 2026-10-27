import type { PickEmLeaderboardEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet } from "lucide-react";

export type PrevWeekWinnerGroup = {
  entries: PickEmLeaderboardEntry[];
  correct: number;
  picked: number;
  prizeWon: number | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPeriodRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const end = new Date(`${weekEnd}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${start} – ${end}`;
}

type CommissionerWeeklyPickEmPayoutsProps = {
  groups: PrevWeekWinnerGroup[];
  weekStart: string;
  weekEnd: string;
  periodLabel?: string | null;
  hasResults: boolean;
  /** True when the pool period dropdown is on a past weekend/week (not the live period). */
  viewingSelectedPeriod?: boolean;
  onViewResults: () => void;
};

export function CommissionerWeeklyPickEmPayouts({
  groups,
  weekStart,
  weekEnd,
  periodLabel,
  hasResults,
  viewingSelectedPeriod = false,
  onViewResults,
}: CommissionerWeeklyPickEmPayoutsProps) {
  const payoutRows = groups.flatMap((group) =>
    group.entries
      .filter((entry) => entry.prizeWon != null && entry.prizeWon > 0)
      .map((entry) => ({
        entry,
        correct: group.correct,
        picked: group.picked,
        prizeWon: entry.prizeWon!,
      })),
  );

  const totalOwed = payoutRows.reduce((sum, row) => sum + row.prizeWon, 0);
  const periodTitle = viewingSelectedPeriod
    ? periodLabel
      ? `Payouts (${periodLabel})`
      : "Payouts for selected period"
    : periodLabel
      ? `Last period (${periodLabel})`
      : "Last period payouts";

  return (
    <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] to-card/60 overflow-hidden">
      <div className="p-6 space-y-4 border-b border-border/40">
        <div className="flex items-start gap-3">
          <Wallet className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="font-bebas text-2xl tracking-wide text-foreground">{periodTitle}</h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              Off-app prizes — Survivor Sharks does not send payments. Pay winners below after the
              period is fully graded.
            </p>
            {weekStart && weekEnd && (
              <p className="text-xs text-muted-foreground/80 mt-1">
                {formatPeriodRange(weekStart, weekEnd)}
              </p>
            )}
          </div>
        </div>

        {payoutRows.length > 0 && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 inline-block">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Total you owe this period
            </div>
            <div className="font-bebas text-2xl text-amber-300 tabular-nums leading-none">
              {fmt(totalOwed)}
            </div>
          </div>
        )}
      </div>

      {payoutRows.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground leading-relaxed">
          {hasResults
            ? "No prize amounts yet — usually means the prior period is still grading or there were no paid places."
            : "No completed prior period yet. Payouts appear here after the last weekend or matchday is fully graded."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider">Player</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Result</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">You owe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payoutRows.map((row) => (
              <TableRow key={row.entry.userId} className="border-border/30">
                <TableCell>
                  <div className="font-medium text-sm">
                    {row.entry.displayName || row.entry.username}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">@{row.entry.username}</div>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {row.correct}/{row.picked} correct
                  {row.entry.rank > 0 && (
                    <span className="block text-[10px] uppercase tracking-wide">
                      Rank #{row.entry.rank}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-semibold tabular-nums text-amber-300">
                    {fmt(row.prizeWon)}
                  </span>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    you owe
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="px-6 py-4 border-t border-border/40 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
          onClick={onViewResults}
        >
          View full results
        </Button>
      </div>
    </div>
  );
}
