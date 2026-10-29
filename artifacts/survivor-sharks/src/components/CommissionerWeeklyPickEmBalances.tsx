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
import { CheckCircle2, Circle, Wallet } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
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
    weekStart: string;
    weekEnd: string;
    totalOwed: number;
    periodPaid: boolean;
  }>;
  players: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    entryFeeOwed: number;
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

async function fetchBalanceSheet(poolId: number): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/pickem/commissioner-balances`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load balance sheet");
  }
  return res.json();
}

async function patchBalanceSheet(poolId: number, patch: LedgerPatch): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/pickem/commissioner-balances`, {
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

export function CommissionerWeeklyPickEmBalances({ poolId }: { poolId: number }) {
  const queryClient = useQueryClient();
  const queryKey = ["weekly-pickem-commissioner-balances", poolId] as const;
  const deviceImportDone = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchBalanceSheet(poolId),
    enabled: poolId > 0,
  });

  const ledgerMutation = useMutation({
    mutationFn: (patch: LedgerPatch) => patchBalanceSheet(poolId, patch),
    onSuccess: (sheet) => {
      queryClient.setQueryData(queryKey, sheet);
    },
  });
  const { mutate: patchLedger, isPending: ledgerPending } = ledgerMutation;

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

  function toggleEntryPaid(userId: number, paid: boolean) {
    patchLedger({ entryPaid: { userId, paid: !paid } });
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
  const showSeasonOwed = summary.totalSeasonOwed > 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="p-6 space-y-4 border-b border-border/40">
        <div className="flex items-start gap-3">
          <Wallet className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bebas text-2xl tracking-wide">Season balance sheet</h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              Who paid entry, who you owe for completed periods
              {showSeasonOwed || !data.poolIsActive ? " and season prizes" : ""}
              {modelLabel ? ` (${modelLabel})` : ""}. Paid flags are saved for this pool.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Entry expected</div>
            <div className="font-semibold tabular-nums">{fmt(summary.totalEntryExpected)}</div>
            <div className="text-xs text-muted-foreground">
              {paidCount}/{players.length} marked paid
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
          </div>
        </div>

        {periods.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Completed periods
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

      <Table>
        <TableHeader>
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wider">Player</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-center w-24">Entry paid</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-right">Entry</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-right">Won (periods)</TableHead>
            {showSeasonOwed && (
              <TableHead className="text-xs uppercase tracking-wider text-right">Season</TableHead>
            )}
            <TableHead className="text-xs uppercase tracking-wider text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p) => {
            const netLabel =
              p.netBalance > 0 ? "owes you" : p.netBalance < 0 ? "you owe" : "even";
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
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {p.entryFeeOwed > 0 ? fmt(p.entryFeeOwed) : "—"}
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
                      p.netBalance > 0
                        ? "text-amber-400"
                        : p.netBalance < 0
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {p.entryFeeOwed > 0 || p.totalWon > 0 ? fmt(Math.abs(p.netBalance)) : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{netLabel}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
