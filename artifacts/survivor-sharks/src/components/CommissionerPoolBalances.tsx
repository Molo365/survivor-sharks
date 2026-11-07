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
  memberCount: number;
  weeklyBonusEnabled: boolean;
  weeklyBonusThresholdMet: boolean;
  poolIsActive: boolean;
  weeklyBonusPeriods: Array<{
    periodKey: string;
    label: string;
    week: number;
    totalOwed: number;
    periodPaid: boolean;
  }>;
  summary: {
    totalEntryExpected: number;
    totalEntryCollected: number;
    totalWeeklyOwed: number;
    totalSeasonOwed: number;
    totalOwedToPlayers: number;
    netToCommissioner: number;
  };
  players: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    entryFeeOwed: number;
    entryPaid: boolean;
    weeklyBonusWon: number;
    seasonPrizeAmount: number;
    seasonPrizePaid: boolean;
    seasonPrizeWon: number;
    totalWon: number;
    netBalance: number;
    weeklyWins: Array<{ week: number; amount: number }>;
  }>;
};

type LedgerPatch = {
  entryPaid?: { userId: number; paid: boolean };
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

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Legacy device-only flags (same keys as weekly pick-em importer). */
function readLegacyDevicePaidState(poolId: number): {
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

function clearLegacyDevicePaidState(poolId: number) {
  localStorage.removeItem(`commissioner-entry-paid-${poolId}`);
  localStorage.removeItem(`commissioner-weekly-period-paid-${poolId}`);
}

type SeasonLedgerApi = "pickem-season" | "survivor-season" | "nfl-confidence";

function seasonPrizePeriodKey(userId: number, ledgerApi: SeasonLedgerApi): string {
  if (ledgerApi === "survivor-season") return `survivor-season-prize-u${userId}`;
  if (ledgerApi === "nfl-confidence") return `nfl-confidence-season-prize-u${userId}`;
  return `pickem-season-prize-u${userId}`;
}

async function fetchBalanceSheet(poolId: number, ledgerApi: SeasonLedgerApi): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/${ledgerApi}/commissioner-balances`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load pool balance sheet");
  }
  return res.json();
}

async function patchBalanceSheet(
  poolId: number,
  ledgerApi: SeasonLedgerApi,
  patch: LedgerPatch,
): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/${ledgerApi}/commissioner-balances`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to update pool balance sheet");
  }
  return res.json();
}

export function CommissionerPoolBalances({
  poolId,
  ledgerApi = "pickem-season",
}: {
  poolId: number;
  ledgerApi?: SeasonLedgerApi;
}) {
  const queryClient = useQueryClient();
  const queryKey = [`${ledgerApi}-commissioner-balances`, poolId] as const;
  const deviceImportDone = useRef(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchBalanceSheet(poolId, ledgerApi),
    enabled: poolId > 0,
  });

  const ledgerMutation = useMutation({
    mutationFn: (patch: LedgerPatch) => patchBalanceSheet(poolId, ledgerApi, patch),
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
  const { mutate: patchLedger, isPending: ledgerPending } = ledgerMutation;

  useEffect(() => {
    if (!data || deviceImportDone.current) return;
    deviceImportDone.current = true;
    const { entryUserIds, periodKeys } = readLegacyDevicePaidState(poolId);
    if (entryUserIds.length === 0 && periodKeys.length === 0) return;
    patchLedger(
      { mergeDeviceState: { entryUserIds, periodKeys } },
      { onSuccess: () => clearLegacyDevicePaidState(poolId) },
    );
  }, [data, poolId, patchLedger]);

  const paidCount = useMemo(() => {
    if (!data) return 0;
    return data.players.filter((p) => p.entryPaid).length;
  }, [data]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-card/60 p-6 text-sm text-muted-foreground">
        Could not load pool balance sheet.
      </div>
    );
  }

  const { summary, players } = data;

  const collapsedSummary = [
    `${paidCount}/${players.length} entry paid`,
    fmt(summary.totalEntryCollected) + " collected",
    `Net ${fmt(summary.netToCommissioner)}`,
  ].join(" · ");

  const isSurvivorLedger = ledgerApi === "survivor-season";

  return (
    <CommissionerAccountingCollapsible
      title="Pool balance sheet"
      playerCount={players.length}
      collapsedSummary={collapsedSummary}
      description={
        isSurvivorLedger ? (
          <>
            Who owes season entry, who you owe after the pool closes and prizes are assigned. Entry
            and prize payouts are saved for this pool.
          </>
        ) : (
          <>
            Who owes entry, who you owe for weekly bonuses
            {data.poolIsActive ? " (season prizes after the pool closes)" : " and season prizes"}.
            Entry, weekly bonus, and season prize payouts are saved for this pool.
            {data.weeklyBonusEnabled && !data.weeklyBonusThresholdMet && (
              <span className="block mt-1">
                Weekly bonus prizes apply after the minimum player count is reached.
              </span>
            )}
          </>
        )
      }
    >
      <div className="p-6 space-y-4 border-b border-border/40">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Entry expected
            </div>
            <div className="font-semibold tabular-nums">{fmt(summary.totalEntryExpected)}</div>
            <div className="text-xs text-muted-foreground">
              {paidCount}/{players.length} marked paid
              {summary.totalEntryCollected > 0 && (
                <span className="block tabular-nums text-emerald-400/90">
                  {fmt(summary.totalEntryCollected)} collected
                </span>
              )}
            </div>
          </div>
          {data.weeklyBonusEnabled && (
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Weekly owed
              </div>
              <div className="font-semibold tabular-nums">{fmt(summary.totalWeeklyOwed)}</div>
            </div>
          )}
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {isSurvivorLedger ? "Prizes owed" : "Season owed"}
            </div>
            <div className="font-semibold tabular-nums">{fmt(summary.totalSeasonOwed)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Net (you keep)
            </div>
            <div
              className={`font-semibold tabular-nums ${
                summary.netToCommissioner >= 0 ? "text-foreground" : "text-amber-400"
              }`}
            >
              {fmt(summary.netToCommissioner)}
            </div>
            <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              After entry collected and prizes owed
            </div>
          </div>
        </div>

        {data.weeklyBonusEnabled && data.weeklyBonusPeriods.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Weekly bonus weeks
            </p>
            <div className="flex flex-wrap gap-2">
              {data.weeklyBonusPeriods.map((p) => (
                <Button
                  key={p.periodKey}
                  type="button"
                  size="sm"
                  variant={p.periodPaid ? "secondary" : "outline"}
                  disabled={ledgerPending}
                  className={`h-auto py-1.5 px-2.5 text-left flex-col items-start gap-0.5 ${
                    p.periodPaid ? "text-emerald-400" : ""
                  }`}
                  onClick={() =>
                    patchLedger({ periodPaid: { periodKey: p.periodKey, paid: !p.periodPaid } })
                  }
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
            <TableHead className="text-xs uppercase tracking-wider text-center w-24">
              Entry paid
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-right">Entry</TableHead>
            {data.weeklyBonusEnabled && (
              <TableHead className="text-xs uppercase tracking-wider text-right">
                Weekly owed
              </TableHead>
            )}
            <TableHead className="text-xs uppercase tracking-wider text-right">
              Season owed
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p) => {
            const netLabel =
              p.netBalance > 0
                ? "owes you"
                : p.netBalance < 0
                  ? "you owe"
                  : "even";
            return (
              <TableRow key={p.userId} className="border-border/30">
                <TableCell>
                  <div className="font-medium text-sm">
                    {p.displayName || p.username}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    @{p.username}
                  </div>
                  {p.weeklyWins.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                      {p.weeklyWins.map((w) => (
                        <Badge
                          key={w.week}
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          W{w.week} {fmt(w.amount)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant={p.entryPaid ? "secondary" : "outline"}
                    disabled={ledgerPending}
                    className={`h-8 gap-1 text-xs ${p.entryPaid ? "text-emerald-400" : ""}`}
                    onClick={() =>
                      patchLedger({ entryPaid: { userId: p.userId, paid: !p.entryPaid } })
                    }
                  >
                    {p.entryPaid ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Circle className="w-3.5 h-3.5" />
                    )}
                    {p.entryPaid ? "Paid" : "Unpaid"}
                  </Button>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {p.entryFeeOwed > 0 ? fmt(p.entryFeeOwed) : "—"}
                </TableCell>
                {data.weeklyBonusEnabled && (
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {p.weeklyBonusWon > 0 ? fmt(p.weeklyBonusWon) : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right text-sm">
                  {p.seasonPrizeAmount > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`tabular-nums ${
                          p.seasonPrizeWon > 0 ? "text-muted-foreground" : "text-emerald-400/90"
                        }`}
                      >
                        {p.seasonPrizeWon > 0 ? fmt(p.seasonPrizeWon) : fmt(p.seasonPrizeAmount)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={p.seasonPrizePaid ? "secondary" : "outline"}
                        disabled={ledgerPending}
                        className={`h-7 gap-1 text-[10px] px-2 ${
                          p.seasonPrizePaid ? "text-emerald-400" : ""
                        }`}
                        onClick={() =>
                          patchLedger({
                            periodPaid: {
                              periodKey: seasonPrizePeriodKey(p.userId, ledgerApi),
                              paid: !p.seasonPrizePaid,
                            },
                          })
                        }
                      >
                        {p.seasonPrizePaid ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Circle className="w-3 h-3" />
                        )}
                        {p.seasonPrizePaid ? "Paid out" : "Mark paid"}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className={`text-sm tabular-nums font-medium ${
                      p.netBalance > 0
                        ? "text-amber-400"
                        : p.netBalance < 0
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {p.entryFeeOwed > 0 || p.totalWon > 0 ? fmt(Math.abs(p.netBalance)) : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {netLabel}
                  </div>
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
