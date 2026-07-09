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
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Users } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AgentPlayer {
  id: number;
  username: string;
  displayName: string | null;
  createdAt: string;
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
    } catch (err: any) {
      setError(err?.message ?? "Failed to reset password");
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

export default function AgentDashboard() {
  const { user } = useAuth();
  const [resetTarget, setResetTarget] = useState<AgentPlayer | null>(null);

  const { data: players, isLoading } = useQuery<AgentPlayer[]>({
    queryKey: ["agent-players"],
    queryFn: () => agentFetch("/players"),
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="container py-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="font-bebas text-4xl tracking-wide text-primary flex items-center gap-3">
            <Users className="w-8 h-8" /> MY PLAYERS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Players registered under {user?.displayName || user?.username}
          </p>
        </div>
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
      </main>
      {resetTarget && (
        <ResetPasswordModal player={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  );
}
