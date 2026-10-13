import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  weeklyBonusEnabled: boolean;
  poolIsActive: boolean;
  summary: {
    totalEntryExpected: number;
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
    weeklyBonusWon: number;
    seasonPrizeWon: number;
    totalWon: number;
    netBalance: number;
    weeklyWins: Array<{ week: number; amount: number }>;
  }>;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function loadEntryPaid(poolId: number): Set<number> {
  try {
    const raw = localStorage.getItem(`commissioner-entry-paid-${poolId}`);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as number[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function saveEntryPaid(poolId: number, ids: Set<number>) {
  localStorage.setItem(
    `commissioner-entry-paid-${poolId}`,
    JSON.stringify([...ids]),
  );
}

async function fetchBalanceSheet(poolId: number): Promise<BalanceSheet> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(
    `${API_BASE}/api/pools/${poolId}/pickem-season/commissioner-balances`,
    {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load balance sheet");
  }
  return res.json();
}

export function CommissionerPoolBalances({ poolId }: { poolId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pickem-season-commissioner-balances", poolId],
    queryFn: () => fetchBalanceSheet(poolId),
    enabled: poolId > 0,
  });

  const [entryPaid, setEntryPaid] = useState<Set<number>>(() =>
    loadEntryPaid(poolId),
  );

  useEffect(() => {
    setEntryPaid(loadEntryPaid(poolId));
  }, [poolId]);

  const paidCount = useMemo(() => {
    if (!data) return 0;
    return data.players.filter((p) => entryPaid.has(p.userId)).length;
  }, [data, entryPaid]);

  function toggleEntryPaid(userId: number) {
    setEntryPaid((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      saveEntryPaid(poolId, next);
      return next;
    });
  }

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
              Entry paid is saved on this device only.
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
            const paid = entryPaid.has(p.userId);
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
                    variant={paid ? "secondary" : "outline"}
                    className={`h-8 gap-1 text-xs ${paid ? "text-emerald-400" : ""}`}
                    onClick={() => toggleEntryPaid(p.userId)}
                  >
                    {paid ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Circle className="w-3.5 h-3.5" />
                    )}
                    {paid ? "Paid" : "Unpaid"}
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
