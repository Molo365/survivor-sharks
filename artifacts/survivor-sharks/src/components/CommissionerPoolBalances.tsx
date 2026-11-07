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
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BalanceSheet = {
  poolId: number;
  poolName: string;
  entryFee: number;
  memberCount: number;
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
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
    seasonPrizeWon: number;
    totalWon: number;
    netBalance: number;
    weeklyWins: Array<{ week: number; amount: number }>;
  }>;
};

type LedgerPatch = {
  entryPaid?: { userId: number; paid: boolean };
  mergeDeviceState?: { entryUserIds?: number[] };
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

/** Legacy device-only flags (same key as weekly pick-em importer). */
function readLegacyDeviceEntryPaid(poolId: number): number[] {
  try {
    const raw = localStorage.getItem(`commissioner-entry-paid-${poolId}`);
    if (!raw) return [];
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

function clearLegacyDeviceEntryPaid(poolId: number) {
  localStorage.removeItem(`commissioner-entry-paid-${poolId}`);
}

async function fetchBalanceSheet(poolId: number): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/pickem-season/commissioner-balances`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load pool balance sheet");
  }
  return res.json();
}

async function patchBalanceSheet(poolId: number, patch: LedgerPatch): Promise<BalanceSheet> {
  const res = await fetch(`${API_BASE}/api/pools/${poolId}/pickem-season/commissioner-balances`, {
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

export function CommissionerPoolBalances({ poolId }: { poolId: number }) {
  const queryClient = useQueryClient();
  const queryKey = ["pickem-season-commissioner-balances", poolId] as const;
  const deviceImportDone = useRef(false);
  const { toast } = useToast();

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
    const entryUserIds = readLegacyDeviceEntryPaid(poolId);
    if (entryUserIds.length === 0) return;
    patchLedger(
      { mergeDeviceState: { entryUserIds } },
      { onSuccess: () => clearLegacyDeviceEntryPaid(poolId) },
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

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="p-6 space-y-4 border-b border-border/40">
        <div className="flex items-start gap-3">
          <Wallet className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bebas text-2xl tracking-wide">Pool balance sheet</h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              Who owes entry, who you owe for weekly bonuses
              {data.poolIsActive ? " (season prizes after the pool closes)" : " and season prizes"}.
              Entry paid is saved for this pool.
            </p>
          </div>
        </div>

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
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Weekly owed
            </div>
            <div className="font-semibold tabular-nums">{fmt(summary.totalWeeklyOwed)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Season owed
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
      </div>

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
                Weekly won
              </TableHead>
            )}
            <TableHead className="text-xs uppercase tracking-wider text-right">Season</TableHead>
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
                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                  {p.seasonPrizeWon > 0 ? fmt(p.seasonPrizeWon) : "—"}
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
  );
}
