import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Circle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CommissionerAccountingCollapsible } from "@/components/CommissionerAccountingCollapsible";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  completedWeekCount?: number;
  memberCount: number;
  weeklyPickEmPayoutModel: "period_pot" | "season_budget" | null;
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
  summary: {
    totalEntryExpected: number;
    totalWeeklyOwed: number;
    totalSeasonOwed: number;
    totalOwedToPlayers: number;
    netToCommissioner: number;
  };
  periods: Array<{
    periodKey: string;
    label: string;
    weekStart?: string;
    weekEnd?: string;
    totalOwed: number;
    periodPaid: boolean;
  }>;
  players: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    entryFeeOwed: number;
    entryFeeTotal?: number;
    entryFeeRemaining?: number;
    entryWeeksCollected?: number;
    weeklyWon: number;
    seasonPrizeWon: number;
    totalWon: number;
    netBalance: number;
    entryPaid: boolean;
    periodWins: Array<{ periodKey: string; label: string; amount: number }>;
  }>;
};

type LedgerPatch = {
  entryPaid?: { userId: number; paid: boolean };
  entryWeeksCollected?: { userId: number; weeksCollected: number };
  periodPaid?: { periodKey: string; paid: boolean };
  mergeDeviceState?: { entryUserIds?: number[]; periodKeys?: string[] };
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Cash still in play after commissioner marks entry collected. */
function playerOutstandingNet(p: {
  entryPaid: boolean;
  entryFeeOwed: number;
  entryFeeRemaining?: number;
  totalWon: number;
}): number {
  const entryStillDue =
    p.entryFeeRemaining != null
      ? p.entryFeeRemaining
      : p.entryPaid
        ? 0
        : p.entryFeeOwed;
  return entryStillDue - p.totalWon;
}

function playerEntryStillDue(p: {
  entryPaid: boolean;
  entryFeeOwed: number;
  entryFeeRemaining?: number;
  entryFeeTotal?: number;
}): number {
  if (p.entryFeeRemaining != null) return p.entryFeeRemaining;
  return p.entryPaid ? 0 : p.entryFeeOwed;
}

function crazyEightsEntryTotal(entryFee: number, weeks: number): number {
  if (entryFee <= 0 || weeks <= 0) return 0;
  return entryFee * weeks;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function readDevicePaidState(poolId: number): {
  entryUserIds: number[];
  periodKeys: string[];
} {
  let entryUserIds: number[] = [];
  let periodKeys: string[] = [];
  try {
    const entryRaw = localStorage.getItem(`commissioner-entry-paid-${poolId}`);
    if (entryRaw) entryUserIds = JSON.parse(entryRaw) as number[];
  } catch {
    /* ignore */
  }
  try {
    const periodRaw = localStorage.getItem(`commissioner-weekly-period-paid-${poolId}`);
    if (periodRaw) periodKeys = JSON.parse(periodRaw) as string[];
  } catch {
    /* ignore */
  }
  return { entryUserIds, periodKeys };
}

function clearDevicePaidState(poolId: number) {
  localStorage.removeItem(`commissioner-entry-paid-${poolId}`);
  localStorage.removeItem(`commissioner-weekly-period-paid-${poolId}`);
}

type CommissionerBalancesApiSegment =
  | "pickem"
  | "nfl-confidence-weekly"
  | "crazy-eights"
  | "nba-ats";

function usesIncrementalWeeklyEntry(
  apiSegment: CommissionerBalancesApiSegment,
  data: Pick<
    BalanceSheet,
    "weeklyPickEmPayoutModel" | "completedWeekCount" | "weeklyBonusEnabled"
  >,
): boolean {
  if (apiSegment === "crazy-eights" || apiSegment === "nfl-confidence-weekly" || apiSegment === "nba-ats") {
    return true;
  }
  if (
    apiSegment === "pickem"
    && data.weeklyPickEmPayoutModel == null
    && (data.completedWeekCount ?? 0) === 1
    && !data.weeklyBonusEnabled
  ) {
    return true;
  }
  return (
    apiSegment === "pickem"
    && (data.weeklyPickEmPayoutModel === "period_pot" || data.weeklyPickEmPayoutModel === "season_budget")
  );
}

function isPickemOneShotContestLedger(data: BalanceSheet): boolean {
  return (
    data.weeklyPickEmPayoutModel == null
    && (data.completedWeekCount ?? 0) === 1
    && !data.weeklyBonusEnabled
  );
}

async function fetchBalanceSheet(
  poolId: number,
  apiSegment: CommissionerBalancesApiSegment,
): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/${apiSegment}/commissioner-balances`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load balance sheet");
  }
  return res.json();
}

async function patchBalanceSheet(
  poolId: number,
  apiSegment: CommissionerBalancesApiSegment,
  patch: LedgerPatch,
): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/${apiSegment}/commissioner-balances`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to update balance sheet");
  }
  return res.json();
}

export function CommissionerWeeklyPickEmBalances({
  poolId,
  apiSegment = "pickem",
  title = "Season balance sheet",
  description,
}: {
  poolId: number;
  apiSegment?: CommissionerBalancesApiSegment;
  title?: string;
  description?: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = [`${apiSegment}-commissioner-balances`, poolId] as const;
  const deviceImportDone = useRef(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchBalanceSheet(poolId, apiSegment),
    enabled: poolId > 0,
  });

  const ledgerMutation = useMutation({
    mutationFn: (patch: LedgerPatch) => patchBalanceSheet(poolId, apiSegment, patch),
    onSuccess: (sheet) => {
      queryClient.setQueryData(queryKey, sheet);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: err.message || "Try again in a moment.",
      });
    },
  });
  const { mutate: patchLedger, isPending: ledgerPending, variables: pendingPatch } = ledgerMutation;

  const pendingEntryUserId =
    pendingPatch?.entryWeeksCollected?.userId
    ?? (pendingPatch?.entryPaid ? pendingPatch.entryPaid.userId : undefined);

  useEffect(() => {
    if (!data || deviceImportDone.current) return;
    deviceImportDone.current = true;
    const { entryUserIds, periodKeys } = readDevicePaidState(poolId);
    if (entryUserIds.length === 0 && periodKeys.length === 0) return;
    patchLedger(
      { mergeDeviceState: { entryUserIds, periodKeys } },
      { onSuccess: () => clearDevicePaidState(poolId) },
    );
  }, [data, poolId, patchLedger]);

  const paidCount = useMemo(() => {
    if (!data) return 0;
    return data.players.filter((p) => p.entryPaid).length;
  }, [data]);

  const entryCollected = useMemo(() => {
    if (!data) return 0;
    return data.players.reduce((s, p) => {
      if (p.entryFeeTotal != null && p.entryFeeRemaining != null) {
        return s + (p.entryFeeTotal - p.entryFeeRemaining);
      }
      if (p.entryPaid) return s + p.entryFeeOwed;
      return s;
    }, 0);
  }, [data]);

  const entryStillDue = useMemo(() => {
    if (!data) return 0;
    return data.players.reduce((s, p) => s + playerEntryStillDue(p), 0);
  }, [data]);

  function toggleEntryPaid(userId: number, paid: boolean) {
    patchLedger({ entryPaid: { userId, paid: !paid } });
  }

  function setEntryWeeksCollected(userId: number, weeksCollected: number) {
    const previous = queryClient.getQueryData<BalanceSheet>(queryKey);
    if (
      previous
      && usesIncrementalWeeklyEntry(apiSegment, previous)
    ) {
      const cap = previous.completedWeekCount ?? 0;
      const clamped = Math.min(Math.max(0, weeksCollected), cap);
      queryClient.setQueryData<BalanceSheet>(queryKey, {
        ...previous,
        players: previous.players.map((player) => {
          if (player.userId !== userId) return player;
          const entryFeeTotal =
            player.entryFeeTotal
            ?? crazyEightsEntryTotal(previous.entryFee, cap);
          const entryFeeRemaining = Math.max(
            0,
            crazyEightsEntryTotal(previous.entryFee, cap - clamped),
          );
          return {
            ...player,
            entryWeeksCollected: clamped,
            entryFeeRemaining,
            entryFeeOwed: entryFeeRemaining,
            entryPaid: clamped >= cap && cap > 0,
            netBalance: entryFeeRemaining - player.totalWon,
          };
        }),
      });
    }
    patchLedger(
      { entryWeeksCollected: { userId, weeksCollected } },
      {
        onError: () => {
          if (previous) queryClient.setQueryData(queryKey, previous);
        },
      },
    );
  }

  function collectOneWeeklyEntry(userId: number, currentWeeks: number) {
    setEntryWeeksCollected(userId, currentWeeks + 1);
  }

  function undoOneWeeklyEntry(userId: number, currentWeeks: number) {
    setEntryWeeksCollected(userId, Math.max(0, currentWeeks - 1));
  }

  function togglePeriodPaid(periodKey: string, paid: boolean) {
    patchLedger({ periodPaid: { periodKey, paid: !paid } });
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-card/60 p-6 text-sm text-muted-foreground">
        Could not load weekly balance sheet.
      </div>
    );
  }

  const { summary, players, periods } = data;
  const modelLabel =
    data.weeklyPickEmPayoutModel === "season_budget"
      ? "Season buy-in"
      : data.weeklyPickEmPayoutModel === "period_pot"
        ? "This week's pot"
        : null;
  const showSeasonOwed = summary.totalSeasonOwed > 0 && apiSegment === "pickem";
  const completedWeekCount = data.completedWeekCount ?? 0;
  const isPickemPeriodPotIncremental =
    apiSegment === "pickem" && data.weeklyPickEmPayoutModel === "period_pot";
  const isPickemSeasonBudgetIncremental =
    apiSegment === "pickem" && data.weeklyPickEmPayoutModel === "season_budget";
  const isPickemIncrementalEntry = isPickemPeriodPotIncremental || isPickemSeasonBudgetIncremental;
  const balanceDescription =
    description
    ?? (apiSegment === "nfl-confidence-weekly"
      ? "Tap the entry amount to record one NFL week collected (same denomination as pool entry). Use − if you tapped too many. Paid flags are saved for this pool."
      : apiSegment === "crazy-eights" || apiSegment === "nba-ats"
        ? apiSegment === "nba-ats"
          ? "Tap the entry amount to record one weekend collected (+denomination). Use − if you tapped too many."
          : "Tap the entry amount to record one week collected (+denomination). Use − if you tapped too many."
        : isPickemPeriodPotIncremental
          ? "Tap the entry amount to record one completed week collected (same denomination as pool entry). Use − if you tapped too many. Paid flags are saved for this pool."
          : isPickemSeasonBudgetIncremental
            ? "Tap the entry amount when you've collected that player's season buy-in. Use − if you tapped by mistake. Paid flags are saved for this pool."
          : apiSegment === "pickem" && isPickemOneShotContestLedger(data)
            ? "Tap the entry amount when you've collected that player's contest buy-in. Use − if you tapped by mistake. Paid flags are saved for this pool."
          : "Who paid entry, who you owe for completed periods. Paid flags are saved for this pool.");
  const weeklyEntryLabel =
    usesIncrementalWeeklyEntry(apiSegment, data)
    && completedWeekCount > 0
    && data.entryFee > 0
      ? isPickemSeasonBudgetIncremental
        ? `1× ${fmt(data.entryFee)} season buy-in per player`
        : apiSegment === "pickem" && isPickemOneShotContestLedger(data)
          ? `1× ${fmt(data.entryFee)} contest buy-in per player`
          : apiSegment === "nba-ats"
            ? `${completedWeekCount}× ${fmt(data.entryFee)}/weekend`
            : `${completedWeekCount}× ${fmt(data.entryFee)}/wk`
      : null;

  const collapsedSummary = [
    `${paidCount}/${players.length} entry paid`,
    entryCollected > 0 ? `${fmt(entryCollected)} collected` : null,
    `Net ${fmt(summary.netToCommissioner)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CommissionerAccountingCollapsible
      title={title}
      playerCount={players.length}
      collapsedSummary={collapsedSummary}
      description={
        <>
          {balanceDescription}
          {apiSegment === "pickem" && modelLabel ? ` (${modelLabel})` : ""}
        </>
      }
    >
      <div className="p-6 space-y-4 border-b border-border/40">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Entry expected</div>
            <div className="font-semibold tabular-nums">{fmt(summary.totalEntryExpected)}</div>
            <div className="text-xs text-muted-foreground">
              {paidCount}/{players.length} marked paid
              {weeklyEntryLabel && (
                <span className="block tabular-nums">{weeklyEntryLabel} per player</span>
              )}
              {entryCollected > 0 && (
                <span className="block tabular-nums text-emerald-400/90">
                  {fmt(entryCollected)} collected
                </span>
              )}
              {entryStillDue > 0 && (
                <span className="block tabular-nums">{fmt(entryStillDue)} still due</span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Weekly owed</div>
            <div className="font-semibold tabular-nums">{fmt(summary.totalWeeklyOwed)}</div>
          </div>
          {showSeasonOwed && (
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Season owed</div>
              <div className="font-semibold tabular-nums">{fmt(summary.totalSeasonOwed)}</div>
            </div>
          )}
          <div className="rounded-lg bg-muted/40 px-3 py-2 col-span-2 sm:col-span-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Net (you keep)</div>
            <div
              className={`font-semibold tabular-nums ${
                summary.netToCommissioner >= 0 ? "text-foreground" : "text-amber-400"
              }`}
            >
              {fmt(summary.netToCommissioner)}
            </div>
            <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              Pool math if all entries in and winners paid
            </div>
          </div>
        </div>

        {periods.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {apiSegment === "nfl-confidence-weekly"
                || apiSegment === "crazy-eights"
                || apiSegment === "nba-ats"
                || isPickemPeriodPotIncremental
                ? apiSegment === "nba-ats"
                  ? "Completed weekends"
                  : isPickemOneShotContestLedger(data)
                    ? "Contest payout"
                    : "Completed weeks"
                : "Completed periods"}
            </p>
            <div className="flex flex-wrap gap-2">
              {periods.map((p) => (
                <Button
                  key={p.periodKey}
                  type="button"
                  size="sm"
                  variant={p.periodPaid ? "secondary" : "outline"}
                  disabled={ledgerPending}
                  className={`h-auto py-1.5 px-2.5 text-left flex-col items-start gap-0.5 ${
                    p.periodPaid ? "text-emerald-400" : ""
                  }`}
                  onClick={() => togglePeriodPaid(p.periodKey, p.periodPaid)}
                >
                  <span className="text-xs font-semibold">{p.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {fmt(p.totalOwed)} · {p.periodPaid ? "paid out" : "mark paid"}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wider">Player</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-center w-24">Entry paid</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-right">
              {apiSegment === "crazy-eights"
                || apiSegment === "nfl-confidence-weekly"
                || apiSegment === "nba-ats"
                || isPickemPeriodPotIncremental
                ? apiSegment === "nba-ats"
                  ? "Entry (weekends)"
                  : isPickemOneShotContestLedger(data)
                    ? "Entry (contest)"
                    : "Entry (weeks)"
                : isPickemSeasonBudgetIncremental
                  ? "Entry (buy-in)"
                : "Entry"}
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-right">Won (periods)</TableHead>
            {showSeasonOwed && (
              <TableHead className="text-xs uppercase tracking-wider text-right">Season</TableHead>
            )}
            <TableHead className="text-xs uppercase tracking-wider text-right">Outstanding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p) => {
            const outstanding = playerOutstandingNet(p);
            const entryRemaining = playerEntryStillDue(p);
            const weeksCollected = p.entryWeeksCollected ?? (p.entryPaid ? completedWeekCount : 0);
            const useWeeklyEntrySteps =
              usesIncrementalWeeklyEntry(apiSegment, data)
              && completedWeekCount > 0
              && data.entryFee > 0;
            const rowBusy = ledgerPending && pendingEntryUserId === p.userId;
            const netLabel =
              outstanding > 0 ? "owes you" : outstanding < 0 ? "you owe" : p.entryPaid ? "paid in" : "even";
            return (
              <TableRow key={p.userId} className="border-border/30">
                <TableCell>
                  <div className="font-medium text-sm">{p.displayName || p.username}</div>
                  <div className="text-xs text-muted-foreground font-mono">@{p.username}</div>
                  {p.periodWins.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                      {p.periodWins.map((w) => (
                        <Badge key={w.periodKey} variant="outline" className="text-[10px] font-normal">
                          {w.label} {fmt(w.amount)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {useWeeklyEntrySteps ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {isPickemSeasonBudgetIncremental
                          ? `${weeksCollected}/${completedWeekCount} buy-in`
                          : `${weeksCollected}/${completedWeekCount} wks`}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={rowBusy || weeksCollected <= 0}
                          className="h-7 w-7 p-0"
                          aria-label={
                            isPickemSeasonBudgetIncremental
                              ? "Undo buy-in collected"
                              : "Undo one week collected"
                          }
                          onClick={() => undoOneWeeklyEntry(p.userId, weeksCollected)}
                        >
                          −
                        </Button>
                        {p.entryPaid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant={p.entryPaid ? "secondary" : "outline"}
                      disabled={ledgerPending}
                      className={`h-8 gap-1 text-xs ${p.entryPaid ? "text-emerald-400" : ""}`}
                      onClick={() => toggleEntryPaid(p.userId, p.entryPaid)}
                    >
                      {p.entryPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      {p.entryPaid ? "Paid" : "Unpaid"}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {useWeeklyEntrySteps ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={rowBusy || entryRemaining <= 0}
                      className="h-auto min-h-11 min-w-[5.5rem] py-2 px-3 flex flex-col items-end ml-auto touch-manipulation border-emerald-500/25 hover:bg-emerald-500/10 active:bg-emerald-500/15 disabled:opacity-60"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        collectOneWeeklyEntry(p.userId, weeksCollected);
                      }}
                    >
                      <span className={entryRemaining > 0 ? "text-foreground" : "text-emerald-400"}>
                        {entryRemaining > 0 ? fmt(entryRemaining) : "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal text-right leading-snug">
                        {entryRemaining > 0
                          ? `tap +${fmt(data.entryFee)}`
                          : isPickemSeasonBudgetIncremental
                            ? `${fmt(data.entryFee)} buy-in in`
                            : `${completedWeekCount}× ${fmt(data.entryFee)} in`}
                      </span>
                    </Button>
                  ) : p.entryFeeOwed > 0 ? (
                    fmt(p.entryFeeOwed)
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                  {p.weeklyWon > 0 ? fmt(p.weeklyWon) : "—"}
                </TableCell>
                {showSeasonOwed && (
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {p.seasonPrizeWon > 0 ? fmt(p.seasonPrizeWon) : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div
                    className={`text-sm tabular-nums font-medium ${
                      outstanding > 0
                        ? "text-amber-400"
                        : outstanding < 0
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {outstanding !== 0
                      ? fmt(Math.abs(outstanding))
                      : entryRemaining <= 0 && p.entryPaid
                        ? "—"
                        : entryRemaining > 0 || p.totalWon > 0
                          ? fmt(0)
                          : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{netLabel}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </CommissionerAccountingCollapsible>
  );
}
