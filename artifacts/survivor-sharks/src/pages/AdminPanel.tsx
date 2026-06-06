import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Shield, LogOut, Users, LayoutGrid, BarChart3, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";

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
interface ProcessResult { processed: number; dates: string[] }

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

  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  const [processDate, setProcessDate] = useState(todayStr);
  const [processingPool, setProcessingPool] = useState<number | null>(null);
  const [processResults, setProcessResults] = useState<Record<number, ProcessResult | "error">>({});

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

  const handleProcessPickem = async (poolId: number) => {
    setProcessingPool(poolId);
    try {
      const result = await adminFetch("/pickem/process-results", {
        method: "POST",
        body: JSON.stringify({ poolId, date: processDate }),
      }) as ProcessResult;
      setProcessResults((prev) => ({ ...prev, [poolId]: result }));
      toast({ title: `Graded ${result.processed} pick${result.processed !== 1 ? "s" : ""}`, description: `Pool #${poolId} · ${processDate}` });
    } catch {
      setProcessResults((prev) => ({ ...prev, [poolId]: "error" }));
      toast({ variant: "destructive", title: "Failed to process results" });
    } finally {
      setProcessingPool(null);
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

        {/* Process Pick-Em Results */}
        <section>
          <h2 className="font-bebas text-2xl tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" /> PROCESS PICK-EM RESULTS
          </h2>
          <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5">
            {/* Date picker */}
            <div className="flex items-center gap-3">
              <label className="text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Date</label>
              <Input
                type="date"
                value={processDate}
                onChange={(e) => {
                  setProcessDate(e.target.value);
                  setProcessResults({});
                }}
                className="bg-background/50 border-primary/20 w-48 font-mono text-sm"
              />
              <span className="text-xs text-muted-foreground">Leave blank to grade all pending picks across all dates</span>
            </div>

            {/* Pool rows */}
            {loadingPools ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : (() => {
              const pickemPools = (pools ?? []).filter((p) => p.poolType === "pickem" && p.isActive);
              if (pickemPools.length === 0) {
                return <p className="text-sm text-muted-foreground py-4 text-center">No active Pick-Em pools found.</p>;
              }
              return (
                <div className="space-y-2">
                  {pickemPools.map((pool) => {
                    const result = processResults[pool.id];
                    const isProcessing = processingPool === pool.id;
                    return (
                      <div key={pool.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-foreground">{pool.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground uppercase">{pool.sport} · #{pool.id}</span>
                        </div>
                        {result && result !== "error" && (
                          <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {result.processed} graded
                          </span>
                        )}
                        {result === "error" && (
                          <span className="text-xs text-destructive shrink-0">Failed</span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-bebas tracking-wider shrink-0 border-primary/30 hover:bg-primary/10"
                          disabled={isProcessing || processingPool !== null}
                          onClick={() => handleProcessPickem(pool.id)}
                        >
                          {isProcessing ? (
                            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing…</>
                          ) : (
                            "Process Results"
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Tables */}
        <section>
          <Tabs defaultValue="pools">
            <TabsList className="bg-card border border-border mb-6">
              <TabsTrigger value="pools" className="font-bebas tracking-wider text-sm gap-2">
                <LayoutGrid className="w-4 h-4" /> Pools {pools && <span className="text-muted-foreground">({pools.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="users" className="font-bebas tracking-wider text-sm gap-2">
                <Users className="w-4 h-4" /> Users {users && <span className="text-muted-foreground">({users.length})</span>}
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
                                  Permanently delete account "{user.username}" and all associated data. Cannot be undone.
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}
