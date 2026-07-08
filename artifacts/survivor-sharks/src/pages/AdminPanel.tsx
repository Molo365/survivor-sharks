import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Shield, LogOut, Users, LayoutGrid, BarChart3, AlertTriangle, ListOrdered, Save, CheckCircle2, RefreshCw, Copy, Ban, ChevronRight, UserPlus, Lock, Network } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useAdminFetch() {
  const { token, logout } = useAdminAuth();
  return useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}/api/admin-panel${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    if (res.status === 401) { logout(); throw new Error("Session expired"); }
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }, [token, logout]);
}

interface StatData { totalUsers: number; totalPools: number; picksToday: number }
interface PoolRow { id: number; name: string; sport: string; poolType: string; isActive: boolean; memberCount: number; commissionerName: string; currentWeek: number; season: number; createdAt: string }
interface UserRow { id: number; username: string; email: string; displayName: string | null; role: string; poolCount: number; createdAt: string }
interface AgentRow { id: number; username: string; displayName: string | null; playerCount: number; createdAt: string }
interface PlayerRow { id: number; username: string; displayName: string | null; poolCount: number; createdAt: string }

interface PoolDetailMember {
  userId: number;
  username: string;
  displayName: string | null;
  status: string;
  eliminatedWeek: number | null;
  joinedAt: string;
  hasPickThisWeek: boolean;
}

interface PoolDetailData {
  id: number;
  name: string;
  sport: string;
  poolType: string;
  isActive: boolean;
  season: number;
  currentWeek: number;
  sandboxMode: boolean;
  entryFee: number;
  prizePot: number;
  prizeMode: string;
  prizeStructure: Array<{ place: number; amount: number }> | null;
  pickFrequency: string;
  isRecurring: boolean;
  inviteCode: string;
  commissionerName: string;
  createdAt: string;
  closureReason: string | null;
  endedAt: string | null;
  totalMembers: number;
  members: PoolDetailMember[];
}

function fmtPoolType(t: string): string {
  const map: Record<string, string> = {
    season: "Survivor Season", weekly: "Survivor Weekly",
    mid_season: "Mid-Season", dirty_dozen: "Dirty Dozen",
    pickem: "Pick-Ems", pickem_season: "Pick-Ems Season",
    crazy_8s: "Crazy 8's", nfl_confidence: "Confidence — Season",
    nfl_confidence_weekly: "Confidence — Weekly",
    group_stage_predictor: "Group Stage Predictor",
    nfl_division_predictor: "NFL Division Predictor",
    wc_bracket: "WC Bracket",
  };
  return map[t] ?? t;
}

function fmtClosureReason(r: string | null): string {
  if (!r) return "";
  const map: Record<string, string> = {
    cancelled_by_commissioner: "Cancelled by commissioner",
    cancelled_by_admin: "Cancelled by admin",
    all_eliminated: "All eliminated",
    winner_declared: "Winner declared",
  };
  return map[r] ?? r;
}

function MemberStatusBadge({ status, eliminatedWeek }: { status: string; eliminatedWeek: number | null }) {
  if (status === "alive") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Alive</Badge>;
  if (status === "winner") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">Winner</Badge>;
  if (status === "eliminated") {
    const label = eliminatedWeek != null ? `Out Wk ${eliminatedWeek}` : "Eliminated";
    return <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">{label}</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground text-[10px]">{status}</Badge>;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function PoolDetailModal({ poolId, onClose }: { poolId: number; onClose: () => void }) {
  const adminFetch = useAdminFetch();
  const { token } = useAdminAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);

  const [detail, setDetail] = useState<PoolDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!poolId || !token) return;
    setIsLoading(true);
    setFetchError(null);
    adminFetch(`/pools/${poolId}/detail`)
      .then((data) => { setDetail(data as PoolDetailData); setIsLoading(false); })
      .catch((err: unknown) => { setFetchError(err instanceof Error ? err.message : "Failed to load"); setIsLoading(false); });
  }, [poolId, token]);

  const handleCopyInvite = () => {
    if (!detail) return;
    const link = `${window.location.origin}/join/${detail.inviteCode}`;
    navigator.clipboard.writeText(link).then(() => {
      toast({ title: "Invite link copied" });
    }).catch(() => {
      toast({ variant: "destructive", title: "Failed to copy link" });
    });
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await adminFetch(`/pools/${poolId}/cancel`, { method: "PATCH" });
      qc.invalidateQueries({ queryKey: ["admin-pools"] });
      qc.invalidateQueries({ queryKey: ["admin-pool-detail", poolId] });
      toast({ title: "Pool cancelled", description: "Pool has been marked inactive." });
    } catch {
      toast({ variant: "destructive", title: "Failed to cancel pool" });
    } finally {
      setCancelling(false);
    }
  };

  const totalCollected = detail ? detail.totalMembers * detail.entryFee : 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border/60 p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-bebas text-3xl tracking-wider text-foreground leading-none">
            {isLoading ? "Loading…" : detail?.name}
          </DialogTitle>
          {detail && (
            <p className="text-xs text-muted-foreground font-mono mt-1">Pool ID: {detail.id}</p>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="px-6 py-10 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
          </div>
        ) : detail ? (
          <div className="px-6 pb-6 space-y-6 mt-4">

            {/* ── Section 1: Pool Info ─────────────────────────────── */}
            <div>
              <h3 className="font-bebas text-lg tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" /> POOL INFO
              </h3>
              <div className="rounded-xl border border-border/50 bg-background/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Sport</p>
                  <p className="font-medium uppercase">{detail.sport}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Pool Type</p>
                  <p className="font-medium">{fmtPoolType(detail.poolType)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Status</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${detail.isActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                    <span className={detail.isActive ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                      {detail.isActive ? "Active" : "Finished"}
                    </span>
                    {detail.sandboxMode && <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[10px] ml-1">Sandbox</Badge>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Season</p>
                  <p className="font-medium">{detail.season}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Current Week</p>
                  <p className="font-medium">{detail.currentWeek}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Pick Frequency</p>
                  <p className="font-medium capitalize">{detail.pickFrequency}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Commissioner</p>
                  <p className="font-medium">{detail.commissionerName}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Recurring</p>
                  <p className="font-medium">{detail.isRecurring ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Created</p>
                  <p className="font-medium">{new Date(detail.createdAt).toLocaleDateString()}</p>
                </div>
                {detail.closureReason && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Closure Reason</p>
                    <p className="font-medium text-destructive/80">{fmtClosureReason(detail.closureReason)}</p>
                  </div>
                )}
                {detail.endedAt && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Ended</p>
                    <p className="font-medium">{new Date(detail.endedAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* ── Section 2: Members ──────────────────────────────── */}
            <div>
              <h3 className="font-bebas text-lg tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> MEMBERS
                <span className="text-primary ml-1">{detail.totalMembers}</span>
              </h3>
              <div className="rounded-xl border border-border/50 bg-background/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Username</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Display Name</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Joined</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Pick Wk {detail.currentWeek}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.members.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No members</TableCell>
                      </TableRow>
                    ) : detail.members.map(m => (
                      <TableRow key={m.userId} className="border-border/30 hover:bg-primary/5">
                        <TableCell className="font-medium text-sm">{m.username}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.displayName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString()}</TableCell>
                        <TableCell><MemberStatusBadge status={m.status} eliminatedWeek={m.eliminatedWeek} /></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={m.hasPickThisWeek
                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-[10px]"
                            : "text-muted-foreground text-[10px]"
                          }>
                            {m.hasPickThisWeek ? "Submitted" : "Pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* ── Section 3: Financials ───────────────────────────── */}
            <div>
              <h3 className="font-bebas text-lg tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> FINANCIALS
              </h3>
              <div className="rounded-xl border border-border/50 bg-background/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Entry Fee</p>
                  <p className="font-medium">{detail.entryFee > 0 ? `$${detail.entryFee.toFixed(2)}` : "Free"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Total Collected</p>
                  <p className="font-medium text-primary">${totalCollected.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Prize Pot</p>
                  <p className="font-medium">{detail.prizePot > 0 ? `$${detail.prizePot.toFixed(2)}` : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Prize Mode</p>
                  <p className="font-medium capitalize">{detail.prizeMode.replace(/_/g, " ")}</p>
                </div>
                {Array.isArray(detail.prizeStructure) && detail.prizeStructure.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Prize Structure</p>
                    <div className="font-medium text-muted-foreground text-xs leading-relaxed space-y-0.5">
                      {detail.prizeStructure.map((p) => (
                        <div key={p.place}>
                          {ordinal(p.place)}: {detail.prizeMode === "percentage" ? `${p.amount}%` : `$${p.amount}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* ── Section 4: Admin Actions ────────────────────────── */}
            <div>
              <h3 className="font-bebas text-lg tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" /> ADMIN ACTIONS
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyInvite}
                  className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Invite Link
                </Button>

                {detail.isActive && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancelling}
                        className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        {cancelling ? "Cancelling…" : "Cancel Pool (Admin Override)"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-destructive/20">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-destructive">Cancel Pool?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Force-cancel "{detail.name}" as admin. This marks the pool inactive immediately, even if members have submitted picks. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Active</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                          Cancel Pool
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="px-6 py-10 text-center text-muted-foreground text-sm">Pool not found.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── GSP Results Section ──────────────────────────────────────────────────────

interface GspPool { id: number; name: string }
interface GspTeamDef { name: string; abbr: string | null; flagUrl: string | null }
interface GspGroupDef { name: string; teams: GspTeamDef[] }
interface GspResultRow { groupName: string; pos1Team: string; pos2Team: string; pos3Team: string; pos4Team: string }

type GroupResultState = [string, string, string, string];

const POS_LABELS = ["1st", "2nd", "3rd", "4th"];

function GspResultsSection() {
  const { token, logout } = useAdminAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const adminFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}/api/admin-panel${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
    });
    if (res.status === 401) { logout(); throw new Error("Session expired"); }
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }, [token, logout]);

  const [selectedPoolId, setSelectedPoolId] = useState<number | null>(null);
  const [groupResults, setGroupResults] = useState<Record<string, GroupResultState>>({});
  const [saving, setSaving] = useState(false);
  const [autoPopulating, setAutoPopulating] = useState(false);

  const { data: pools, isLoading: loadingPools } = useQuery<GspPool[]>({
    queryKey: ["admin-gsp-pools"],
    queryFn: () => adminFetch("/gsp/pools"),
  });

  const { data: groups } = useQuery<GspGroupDef[]>({
    queryKey: ["admin-gsp-groups"],
    queryFn: () => adminFetch("/gsp/groups"),
  });

  const { data: existingResults } = useQuery<GspResultRow[]>({
    queryKey: ["admin-gsp-results", selectedPoolId],
    queryFn: () => adminFetch(`/gsp/results/${selectedPoolId}`),
    enabled: selectedPoolId !== null,
  });

  // Populate form state when existing results load
  useEffect(() => {
    if (!existingResults) return;
    const next: Record<string, GroupResultState> = {};
    for (const r of existingResults) {
      next[r.groupName] = [r.pos1Team, r.pos2Team, r.pos3Team, r.pos4Team];
    }
    setGroupResults((prev) => ({ ...prev, ...next }));
  }, [existingResults]);

  function setTeam(groupName: string, posIdx: number, teamName: string) {
    setGroupResults((prev) => {
      const current: GroupResultState = prev[groupName] ?? ["", "", "", ""];
      const next = [...current] as GroupResultState;
      next[posIdx] = teamName;
      return { ...prev, [groupName]: next };
    });
  }

  function getAvailableTeams(groupName: string, allTeams: GspTeamDef[], posIdx: number): GspTeamDef[] {
    const current = groupResults[groupName] ?? ["", "", "", ""];
    const usedTeams = new Set(current.filter((t, i) => i !== posIdx && t !== ""));
    return allTeams.filter((t) => !usedTeams.has(t.name));
  }

  const completedGroups = groups?.filter((g) => {
    const r = groupResults[g.name];
    return r && r.every((t) => t !== "");
  }) ?? [];

  const handleAutoPopulate = async () => {
    if (!selectedPoolId) return;
    setAutoPopulating(true);
    try {
      const data = await adminFetch("/gsp/auto-results", {
        method: "POST",
        body: JSON.stringify({ poolId: selectedPoolId }),
      }) as { saved: number; closedPool: boolean; closureWarning?: string };
      qc.invalidateQueries({ queryKey: ["admin-gsp-results", selectedPoolId] });
      if (data?.closureWarning) {
        qc.invalidateQueries({ queryKey: ["admin-gsp-pools"] });
        toast({ variant: "destructive", title: `Populated ${data.saved} groups from ESPN — closure failed`, description: data.closureWarning });
      } else if (data?.closedPool) {
        qc.invalidateQueries({ queryKey: ["admin-gsp-pools"] });
        toast({ title: "Pool closed — winner declared!", description: `Imported ${data.saved} group results from ESPN standings. Leaderboard now shows the winner.` });
      } else {
        toast({ title: `Imported ${data.saved} group results from ESPN`, description: "Leaderboard scores will update automatically." });
      }
    } catch {
      toast({ variant: "destructive", title: "Auto-populate failed", description: "ESPN standings may be unavailable. Try again or enter results manually." });
    } finally {
      setAutoPopulating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPoolId || completedGroups.length === 0) return;
    setSaving(true);
    try {
      const payload = completedGroups.map((g) => {
        const [pos1Team, pos2Team, pos3Team, pos4Team] = groupResults[g.name];
        return { groupName: g.name, pos1Team, pos2Team, pos3Team, pos4Team };
      });
      const data = await adminFetch("/gsp/results", {
        method: "POST",
        body: JSON.stringify({ poolId: selectedPoolId, results: payload }),
      }) as { saved: number; closedPool: boolean; closureWarning?: string };
      qc.invalidateQueries({ queryKey: ["admin-gsp-results", selectedPoolId] });
      if (data?.closureWarning) {
        qc.invalidateQueries({ queryKey: ["admin-gsp-pools"] });
        toast({ variant: "destructive", title: `Saved ${payload.length} group result${payload.length !== 1 ? "s" : ""} — pool closure failed`, description: data.closureWarning });
      } else if (data?.closedPool) {
        qc.invalidateQueries({ queryKey: ["admin-gsp-pools"] });
        toast({ title: "Pool closed — winner declared!", description: "All group results are final. Leaderboard now shows the winner." });
      } else {
        toast({ title: `Saved ${payload.length} group result${payload.length !== 1 ? "s" : ""}`, description: "Leaderboard scores will update automatically." });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to save results" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Pool selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider shrink-0">Pool</label>
        {loadingPools ? (
          <Skeleton className="h-10 w-64" />
        ) : !pools?.length ? (
          <p className="text-sm text-muted-foreground">No Group Stage Predictor pools found.</p>
        ) : (
          <Select
            value={selectedPoolId !== null ? String(selectedPoolId) : ""}
            onValueChange={(v) => {
              setSelectedPoolId(Number(v));
              setGroupResults({});
            }}
          >
            <SelectTrigger className="w-64 bg-card border-border">
              <SelectValue placeholder="Select a pool…" />
            </SelectTrigger>
            <SelectContent>
              {pools.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedPoolId !== null && (
          <Button
            onClick={handleAutoPopulate}
            disabled={autoPopulating || saving}
            variant="outline"
            className="gap-2 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 font-semibold"
          >
            <RefreshCw className={`w-4 h-4 ${autoPopulating ? "animate-spin" : ""}`} />
            {autoPopulating ? "Importing…" : "Auto-populate from ESPN"}
          </Button>
        )}

        {selectedPoolId !== null && completedGroups.length > 0 && (
          <Button
            onClick={handleSave}
            disabled={saving || autoPopulating}
            className="gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : `Save ${completedGroups.length} Group${completedGroups.length !== 1 ? "s" : ""}`}
          </Button>
        )}
      </div>

      {/* Scoring explanation */}
      <div className="rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-yellow-400 font-semibold">3 pts</span> — exact position match</span>
        <span><span className="text-primary font-semibold">1 pt</span> — team is in top 2 + player had them top 2 (wrong slot)</span>
        <span><span className="text-muted-foreground font-semibold">0 pts</span> — all other cases</span>
        <span className="ml-auto font-medium text-foreground">Max: 144 pts</span>
      </div>

      {selectedPoolId === null ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center rounded-xl border border-dashed border-border/50">
          <ListOrdered className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">Select a pool above to enter group standings.</p>
        </div>
      ) : !groups ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => {
            const result = groupResults[group.name] ?? ["", "", "", ""];
            const isComplete = result.every((t) => t !== "");

            return (
              <div
                key={group.name}
                className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-all ${
                  isComplete
                    ? "border-yellow-500/50 bg-yellow-500/5"
                    : "border-border/50 bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bebas text-2xl tracking-wider">Group {group.name}</span>
                  {isComplete && <CheckCircle2 className="w-4 h-4 text-yellow-400" />}
                </div>

                <div className="flex flex-col gap-2">
                  {POS_LABELS.map((label, posIdx) => {
                    const available = getAvailableTeams(group.name, group.teams, posIdx);
                    return (
                      <div key={posIdx} className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-8 shrink-0">{label}</span>
                        <Select
                          value={result[posIdx] || ""}
                          onValueChange={(v) => setTeam(group.name, posIdx, v)}
                        >
                          <SelectTrigger className="flex-1 h-8 text-sm bg-background/50 border-border/40">
                            <SelectValue placeholder="Pick team…" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Always show the currently selected value even if not in available */}
                            {group.teams.map((t) => {
                              const isAvailable = available.some((a) => a.name === t.name) || t.name === result[posIdx];
                              return isAvailable ? (
                                <SelectItem key={t.name} value={t.name}>
                                  {t.name}
                                </SelectItem>
                              ) : null;
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CredentialsBox({ username, password }: { username: string; password: string }) {
  const { toast } = useToast();
  const handleCopy = () => {
    navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`)
      .then(() => toast({ title: "Credentials copied" }))
      .catch(() => toast({ variant: "destructive", title: "Failed to copy" }));
  };
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
      <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> Shown only once — copy now before closing
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Username</p>
          <p className="font-mono font-bold">{username}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Password</p>
          <p className="font-mono font-bold">{password}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="gap-2 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300" onClick={handleCopy}>
        <Copy className="w-3.5 h-3.5" /> Copy Credentials
      </Button>
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const adminFetch = useAdminFetch();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      await adminFetch("/users", {
        method: "POST",
        body: JSON.stringify({ username, email, password, displayName: displayName || undefined, role }),
      });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "User created", description: `${username} has been created` });
      onClose();
    } catch (err: any) {
      const message = err?.message?.includes("409")
        ? "Username or email already taken"
        : err?.message?.includes("400")
        ? "Password must be at least 6 characters"
        : "Failed to create user";
      setCreateError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/40 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> CREATE USER
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="cu-username">Username *</Label>
            <Input id="cu-username" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input id="cu-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-displayName">Display Name</Label>
            <Input id="cu-displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-password">Password *</Label>
            <Input id="cu-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" />
            <p className="text-xs text-muted-foreground mt-1">Minimum 6 characters</p>
          </div>
          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cu-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "user" | "admin")}>
              <SelectTrigger id="cu-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !username || !password}>
              {submitting ? "Creating…" : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordModal({ userId, username, onClose }: { userId: number; username: string; onClose: () => void }) {
  const adminFetch = useAdminFetch();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword || newPassword.length < 6) return;
    setSubmitting(true);
    try {
      await adminFetch(`/users/${userId}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      toast({ title: "Password reset", description: `Password for ${username} has been updated` });
      onClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to reset password", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/40 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" /> RESET PASSWORD
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">Resetting password for <span className="font-medium text-foreground">{username}</span></p>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rp-new">New Password</Label>
            <Input id="rp-new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-confirm">Confirm Password</Label>
            <Input id="rp-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" className={mismatch ? "border-destructive" : ""} />
            {mismatch && <p className="text-xs text-destructive">Passwords do not match</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || mismatch || newPassword.length < 6 || !confirmPassword}>
              {submitting ? "Saving…" : "Reset Password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const adminFetch = useAdminFetch();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const data = await adminFetch("/agents", {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim() }),
      }) as { id: number; username: string; password: string; displayName: string };
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      setCreds({ username: data.username, password: data.password });
    } catch {
      setCreateError("Failed to create agent");
    } finally {
      setSubmitting(false);
    }
  };

  if (creds) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="border-border/40 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide text-primary">Agent Created</DialogTitle>
          </DialogHeader>
          <CredentialsBox username={creds.username} password={creds.password} />
          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/40 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> CREATE AGENT
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ca-displayName">Display Name *</Label>
            <Input id="ca-displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} required autoComplete="off" placeholder="Agent's real name or business" />
          </div>
          {createError && <p className="text-xs text-destructive">{createError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !displayName.trim()}>
              {submitting ? "Creating…" : "Create Agent"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPlayerModal({ agentId, onClose, onCreated }: { agentId: number; onClose: () => void; onCreated: (creds: { username: string; password: string }) => void }) {
  const adminFetch = useAdminFetch();
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSubmitting(true);
    setAddError(null);
    try {
      const data = await adminFetch(`/agents/${agentId}/players`, {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim() }),
      }) as { id: number; username: string; password: string; displayName: string };
      onCreated({ username: data.username, password: data.password });
    } catch {
      setAddError("Failed to create player");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/40 max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide">ADD PLAYER</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-displayName">Display Name *</Label>
            <Input id="ap-displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} required autoComplete="off" placeholder="Player's name" />
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !displayName.trim()}>
              {submitting ? "Adding…" : "Add Player"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AgentDetailModal({ agent, onClose }: { agent: AgentRow; onClose: () => void }) {
  const adminFetch = useAdminFetch();
  const qc = useQueryClient();
  const { token } = useAdminAuth();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [playerCreds, setPlayerCreds] = useState<{ username: string; password: string } | null>(null);

  const fetchPlayers = useCallback(async () => {
    if (!token) return;
    setLoadingPlayers(true);
    try {
      const data = await adminFetch(`/agents/${agent.id}/players`) as PlayerRow[];
      setPlayers(data);
    } catch { /* ignore */ } finally {
      setLoadingPlayers(false);
    }
  }, [agent.id, token, adminFetch]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  const handlePlayerCreated = (creds: { username: string; password: string }) => {
    setAddPlayerOpen(false);
    setPlayerCreds(creds);
    qc.invalidateQueries({ queryKey: ["admin-agents"] });
    fetchPlayers();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="border-border/40 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">
              {agent.displayName ?? agent.username}
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-mono">@{agent.username}</p>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {playerCreds && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">New player credentials:</p>
                <CredentialsBox username={playerCreds.username} password={playerCreds.password} />
              </div>
            )}
            <div className="flex justify-between items-center">
              <h3 className="font-bebas tracking-wider text-lg">PLAYERS ({players.length})</h3>
              <Button size="sm" className="gap-2" onClick={() => { setPlayerCreds(null); setAddPlayerOpen(true); }}>
                <UserPlus className="w-4 h-4" /> Add Player
              </Button>
            </div>
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Username</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Display Name</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Pools</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPlayers ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                    ))
                  ) : !players.length ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No players yet</TableCell></TableRow>
                  ) : players.map(p => (
                    <TableRow key={p.id} className="border-border/40">
                      <TableCell className="font-mono text-sm">{p.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.displayName ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                      <TableCell className="text-sm">{p.poolCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {addPlayerOpen && (
        <AddPlayerModal agentId={agent.id} onClose={() => setAddPlayerOpen(false)} onCreated={handlePlayerCreated} />
      )}
    </>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | undefined; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        {value === undefined
          ? <Skeleton className="h-7 w-16 mt-1" />
          : <p className="font-bebas text-3xl tracking-wide text-foreground">{value.toLocaleString()}</p>}
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { logout } = useAdminAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const adminFetch = useAdminFetch();

  const { data: envData } = useQuery<{ isProduction: boolean }>({
    queryKey: ["admin-environment"],
    queryFn: () => adminFetch("/environment"),
    staleTime: Infinity,
  });
  const isProduction = envData?.isProduction ?? false;

  const { data: stats } = useQuery<StatData>({
    queryKey: ["admin-stats"],
    queryFn: () => adminFetch("/stats"),
    refetchInterval: 30000,
  });

  const { data: pools, isLoading: loadingPools } = useQuery<PoolRow[]>({
    queryKey: ["admin-pools"],
    queryFn: () => adminFetch("/pools"),
  });

  const { data: users, isLoading: loadingUsers } = useQuery<UserRow[]>({
    queryKey: ["admin-users"],
    queryFn: () => adminFetch("/users"),
  });

  const { data: agents, isLoading: loadingAgents } = useQuery<AgentRow[]>({
    queryKey: ["admin-agents"],
    queryFn: () => adminFetch("/agents"),
  });

  const deletePool = useMutation({
    mutationFn: (id: number) => adminFetch(`/pools/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pools"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "Pool deleted" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to delete pool" }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => adminFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "User deleted" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to delete user" }),
  });

  const [wiping, setWiping] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [detailPoolId, setDetailPoolId] = useState<number | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [resetPwUser, setResetPwUser] = useState<{ id: number; username: string } | null>(null);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [agentDetail, setAgentDetail] = useState<AgentRow | null>(null);

  const handleWipe = async () => {
    setWiping(true);
    try {
      const data = await adminFetch("/wipe-test-data", { method: "POST" }) as { poolsDeleted: number; usersDeleted: number };
      qc.invalidateQueries({ queryKey: ["admin-pools"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: `Wiped test data`, description: `${data.poolsDeleted} pools, ${data.usersDeleted} users removed` });
    } catch {
      toast({ variant: "destructive", title: "Wipe failed" });
    } finally {
      setWiping(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await adminFetch("/reset-database", { method: "POST" });
      qc.invalidateQueries();
      toast({ title: "Database reset", description: "All data has been wiped" });
    } catch {
      toast({ variant: "destructive", title: "Reset failed" });
    } finally {
      setResetting(false);
    }
  };

  const handleLogout = () => {
    logout();
    setLocation("/admin/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Admin header — separate from regular NavBar */}
      <header className="sticky top-0 z-50 border-b border-destructive/20 bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-destructive" />
            <span className="font-bebas text-xl tracking-widest text-destructive">ADMIN PANEL</span>
            <span className="hidden sm:inline text-xs text-muted-foreground/50 ml-2">· Survivor Sharks</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <section>
          <h2 className="font-bebas text-2xl tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> SITE STATISTICS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Users" value={stats?.totalUsers} icon={<Users className="w-5 h-5 text-primary" />} />
            <StatCard label="Total Pools" value={stats?.totalPools} icon={<LayoutGrid className="w-5 h-5 text-primary" />} />
            <StatCard label="Picks Today" value={stats?.picksToday} icon={<BarChart3 className="w-5 h-5 text-primary" />} />
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="font-bebas text-2xl tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" /> DANGER ZONE
          </h2>
          {isProduction ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
              <p className="text-sm text-muted-foreground">Danger Zone actions are disabled in production.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={wiping} className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300">
                    {wiping ? "Wiping…" : "Wipe Test Data"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-destructive/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-orange-400">Wipe Test Data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deletes all pools and users whose names contain "test" (case-insensitive). This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleWipe} className="bg-orange-500 hover:bg-orange-600 text-white">Wipe Test Data</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={resetting} className="font-semibold">
                    {resetting ? "Resetting…" : "Full Database Reset"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-destructive/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-destructive">Full Database Reset?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <span className="text-destructive font-semibold">This wipes ALL data</span> — every user, pool, pick, and result. This is permanent and cannot be undone. The database will be completely empty.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      Yes, Wipe Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </section>

        {/* Tables */}
        <section>
          <Tabs defaultValue="pools">
            <TabsList className="bg-card border border-border mb-6 flex-wrap h-auto">
              <TabsTrigger value="pools" className="font-bebas tracking-wider text-sm gap-2">
                <LayoutGrid className="w-4 h-4" /> Pools {pools && <span className="text-muted-foreground">({pools.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="users" className="font-bebas tracking-wider text-sm gap-2">
                <Users className="w-4 h-4" /> Users {users && <span className="text-muted-foreground">({users.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="agents" className="font-bebas tracking-wider text-sm gap-2">
                <Network className="w-4 h-4" /> Agents {agents && <span className="text-muted-foreground">({agents.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="wc-groups" className="font-bebas tracking-wider text-sm gap-2">
                <ListOrdered className="w-4 h-4" /> WC Group Results
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pools">
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">ID</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Sport</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Commissioner</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Members</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPools ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                      ))
                    ) : !pools?.length ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No pools found</TableCell></TableRow>
                    ) : pools.map(pool => (
                      <TableRow
                        key={pool.id}
                        className="border-border/40 hover:bg-primary/5 transition-colors cursor-pointer"
                        onClick={() => setDetailPoolId(pool.id)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{pool.id}</TableCell>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {pool.name}
                            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          </span>
                        </TableCell>
                        <TableCell className="uppercase text-sm text-muted-foreground">{pool.sport}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{pool.commissionerName}</TableCell>
                        <TableCell className="text-sm">{pool.memberCount}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pool.isActive ? "bg-accent/20 text-accent border border-accent/30" : "bg-muted text-muted-foreground"}`}>
                            {pool.isActive ? "Active" : "Finished"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-destructive/20">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-destructive">Delete Pool?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Permanently delete "{pool.name}" and all its picks and member records. Cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePool.mutate(pool.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                  Delete Permanently
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="users">
              <div className="flex justify-end mb-3">
                <Button size="sm" className="gap-2" onClick={() => setCreateUserOpen(true)}>
                  <UserPlus className="w-4 h-4" /> Create User
                </Button>
              </div>
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">ID</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Username</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Display Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Email</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Role</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Pools</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Joined</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingUsers ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                      ))
                    ) : !users?.length ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No users found</TableCell></TableRow>
                    ) : users.map(user => (
                      <TableRow key={user.id} className="border-border/40 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">{user.id}</TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.displayName ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.role === "admin" ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted text-muted-foreground"}`}>
                            {user.role.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{user.poolCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-foreground hover:bg-muted/40 h-8 w-8"
                              onClick={() => setResetPwUser({ id: user.id, username: user.username })}
                              title="Reset password"
                            >
                              <Lock className="w-4 h-4" />
                            </Button>
                            {user.role !== "admin" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="border-destructive/20">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-destructive">Delete User?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete {user.username}? This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteUser.mutate(user.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                      Delete Permanently
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="agents">
              <div className="flex justify-end mb-3">
                <Button size="sm" className="gap-2" onClick={() => setCreateAgentOpen(true)}>
                  <Network className="w-4 h-4" /> Create Agent
                </Button>
              </div>
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Display Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Username</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Players</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAgents ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                      ))
                    ) : !agents?.length ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No agents yet</TableCell></TableRow>
                    ) : agents.map(agent => (
                      <TableRow
                        key={agent.id}
                        className="border-border/40 hover:bg-primary/5 transition-colors cursor-pointer"
                        onClick={() => setAgentDetail(agent)}
                      >
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {agent.displayName ?? <span className="text-muted-foreground/40">—</span>}
                            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">@{agent.username}</TableCell>
                        <TableCell className="text-sm">{agent.playerCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(agent.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="wc-groups">
              <GspResultsSection />
            </TabsContent>
          </Tabs>
        </section>
      </main>

      {detailPoolId !== null && (
        <PoolDetailModal poolId={detailPoolId} onClose={() => setDetailPoolId(null)} />
      )}
      {createUserOpen && (
        <CreateUserModal onClose={() => setCreateUserOpen(false)} />
      )}
      {resetPwUser !== null && (
        <ResetPasswordModal userId={resetPwUser.id} username={resetPwUser.username} onClose={() => setResetPwUser(null)} />
      )}
      {createAgentOpen && (
        <CreateAgentModal onClose={() => setCreateAgentOpen(false)} />
      )}
      {agentDetail !== null && (
        <AgentDetailModal agent={agentDetail} onClose={() => setAgentDetail(null)} />
      )}
    </div>
  );
}
