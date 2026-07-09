import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Users, BarChart3, CheckCircle2, Circle } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AgentPlayer {
  id: number;
  username: string;
  displayName: string | null;
  createdAt: string;
}

interface PoolBalance {
  poolId: number;
  poolName: string;
  sport: string;
  entryFee: number;
  isActive: boolean;
  prizeWon: number;
  settled: boolean;
}

interface PlayerBalance {
  id: number;
  username: string;
  displayName: string | null;
  pools: PoolBalance[];
  totalOwed: number;
  totalWon: number;
  netBalance: number;
}

async function agentFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}/api/agent${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

function fmt(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function ResetPasswordModal({ player, onClose }: { player: AgentPlayer; onClose: () => void }) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await agentFetch(`/players/${player.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      toast({ title: "Password reset", description: `New password set for ${player.username}` });
      onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/40 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> RESET PASSWORD
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">@{player.username}</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rp-new">New Password</Label>
            <Input id="rp-new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-confirm">Confirm Password</Label>
            <Input id="rp-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !newPassword || !confirm}>
              {submitting ? "Saving…" : "Reset Password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlayersTab() {
  const [resetTarget, setResetTarget] = useState<AgentPlayer | null>(null);

  const { data: players, isLoading } = useQuery<AgentPlayer[]>({
    queryKey: ["agent-players"],
    queryFn: () => agentFetch("/players"),
  });

  return (
    <>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Username</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Display Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Joined</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              ))
            ) : !players?.length ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No players yet</TableCell></TableRow>
            ) : players.map(p => (
              <TableRow key={p.id} className="border-border/40">
                <TableCell className="font-mono text-sm">{p.username}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.displayName ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setResetTarget(p)}>
                    <KeyRound className="w-3.5 h-3.5" /> Reset Password
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {resetTarget && (
        <ResetPasswordModal player={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </>
  );
}

function BalancesTab() {
  const { data: balances, isLoading } = useQuery<PlayerBalance[]>({
    queryKey: ["agent-balances"],
    queryFn: () => agentFetch("/balances"),
  });

  // Client-side settled toggle state: Set of player IDs that are marked settled
  const [settledPlayers, setSettledPlayers] = useState<Set<number>>(new Set());

  function toggleSettled(playerId: number) {
    setSettledPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-4">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!balances?.length) {
    return (
      <div className="rounded-xl border border-border/50 bg-card flex items-center justify-center py-16 text-muted-foreground text-sm">
        No players yet
      </div>
    );
  }

  // Grand totals
  const grandOwed = balances.reduce((s, p) => s + p.totalOwed, 0);
  const grandWon  = balances.reduce((s, p) => s + p.totalWon, 0);
  const grandNet  = grandOwed - grandWon;

  return (
    <div className="space-y-5">
      {balances.map((player) => {
        const isSettled = settledPlayers.has(player.id);
        return (
          <div key={player.id} className={`rounded-xl border bg-card overflow-hidden transition-colors ${isSettled ? "border-emerald-500/40 opacity-70" : "border-border/50"}`}>
            {/* Player header row */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">{player.displayName || player.username}</span>
                <span className="font-mono text-xs text-muted-foreground">@{player.username}</span>
                {isSettled && (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 text-xs">Settled</Badge>
                )}
              </div>
              <Button
                size="sm"
                variant={isSettled ? "outline" : "secondary"}
                className={`gap-1.5 text-xs h-7 ${isSettled ? "border-emerald-500/40 text-emerald-400 hover:text-emerald-300" : ""}`}
                onClick={() => toggleSettled(player.id)}
              >
                {isSettled
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Settled</>
                  : <><Circle className="w-3.5 h-3.5" /> Mark Settled</>}
              </Button>
            </div>

            {/* Pool rows */}
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Pool</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Sport</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Entry Fee</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Prize Won</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {player.pools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-xs">Not in any pools</TableCell>
                  </TableRow>
                ) : player.pools.map((pool) => {
                  const net = pool.entryFee - pool.prizeWon;
                  return (
                    <TableRow key={pool.poolId} className="border-border/30">
                      <TableCell className="text-sm">{pool.poolName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground uppercase">{pool.sport}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${pool.isActive ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground border-border/40"}`}>
                          {pool.isActive ? "Active" : "Closed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{pool.entryFee > 0 ? fmt(pool.entryFee) : <span className="text-muted-foreground/50">—</span>}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pool.prizeWon > 0 ? fmt(pool.prizeWon) : <span className="text-muted-foreground/50">—</span>}</TableCell>
                      <TableCell className={`text-right text-sm tabular-nums font-medium ${net > 0 ? "text-amber-400" : net < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {pool.entryFee > 0 || pool.prizeWon > 0 ? fmt(net) : <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Player subtotal */}
                <TableRow className="border-t border-border/50 bg-muted/20 font-medium">
                  <TableCell colSpan={3} className="text-xs uppercase tracking-wider text-muted-foreground">Subtotal</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{player.totalOwed > 0 ? fmt(player.totalOwed) : "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{player.totalWon > 0 ? fmt(player.totalWon) : "—"}</TableCell>
                  <TableCell className={`text-right text-sm tabular-nums font-semibold ${player.netBalance > 0 ? "text-amber-400" : player.netBalance < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {player.totalOwed > 0 || player.totalWon > 0 ? fmt(player.netBalance) : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        );
      })}

      {/* Grand total */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <Table>
          <TableBody>
            <TableRow className="bg-muted/30 font-bold border-none">
              <TableCell colSpan={3} className="text-sm uppercase tracking-wider">Grand Total ({balances.length} player{balances.length !== 1 ? "s" : ""})</TableCell>
              <TableCell className="text-right text-sm tabular-nums w-28">{grandOwed > 0 ? fmt(grandOwed) : "—"}</TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground w-28">{grandWon > 0 ? fmt(grandWon) : "—"}</TableCell>
              <TableCell className={`text-right text-sm tabular-nums font-bold w-28 ${grandNet > 0 ? "text-amber-400" : grandNet < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                {grandOwed > 0 || grandWon > 0 ? fmt(grandNet) : "—"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type Tab = "players" | "balances";

export default function AgentDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("players");

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="container py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="font-bebas text-4xl tracking-wide text-primary flex items-center gap-3">
            <Users className="w-8 h-8" /> AGENT DASHBOARD
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.displayName || user?.username}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 border-b border-border/40 pb-0">
          <button
            onClick={() => setTab("players")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === "players" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="w-4 h-4" /> My Players
          </button>
          <button
            onClick={() => setTab("balances")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === "balances" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <BarChart3 className="w-4 h-4" /> Balances
          </button>
        </div>

        {tab === "players" ? <PlayersTab /> : <BalancesTab />}
      </main>
    </div>
  );
}
