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
import { Trash2, Shield, LogOut, Users, LayoutGrid, BarChart3, AlertTriangle, ListOrdered, Save, CheckCircle2 } from "lucide-react";

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

        {selectedPoolId !== null && completedGroups.length > 0 && (
          <Button
            onClick={handleSave}
            disabled={saving}
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
                      <TableRow key={pool.id} className="border-border/40 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">{pool.id}</TableCell>
                        <TableCell className="font-medium">{pool.name}</TableCell>
                        <TableCell className="uppercase text-sm text-muted-foreground">{pool.sport}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{pool.commissionerName}</TableCell>
                        <TableCell className="text-sm">{pool.memberCount}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pool.isActive ? "bg-accent/20 text-accent border border-accent/30" : "bg-muted text-muted-foreground"}`}>
                            {pool.isActive ? "Active" : "Finished"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
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
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">ID</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Username</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Email</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Role</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Pools</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Joined</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingUsers ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                      ))
                    ) : !users?.length ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No users found</TableCell></TableRow>
                    ) : users.map(user => (
                      <TableRow key={user.id} className="border-border/40 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">{user.id}</TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.role === "admin" ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted text-muted-foreground"}`}>
                            {user.role.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{user.poolCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
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
                        </TableCell>
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
    </div>
  );
}
