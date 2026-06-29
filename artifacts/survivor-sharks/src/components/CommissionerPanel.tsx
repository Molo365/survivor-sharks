import { useState, useRef, useEffect } from "react";
import { useGetPool, useGetSportTeams, useUpdatePool, useProcessResults, getGetPoolQueryKey, getGetResultsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, AlertTriangle, Settings2, CheckCircle2, ChevronDown, ChevronUp, Bug, Zap, Play, BarChart3, OctagonX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type Sport = "nfl" | "mlb" | "nba" | "nhl" | "fifa";

interface ProcessDebug {
  inputEntered: string[];
  resolvedLosingIds: { id: string; abbreviation: string }[];
  picks: { userId: number; teamId: string; teamName: string; abbreviation: string; result: string }[];
  forfeits: number[];
}

export function CommissionerPanel({ poolId, isSuperAdmin = false }: { poolId: number; isSuperAdmin?: boolean }) {
  const { data: pool, isLoading: loadingPool } = useGetPool(poolId, {
    query: { enabled: !!poolId, queryKey: getGetPoolQueryKey(poolId) },
  });

  const sport = (pool?.sport ?? "nfl") as Sport;
  const { data: teams } = useGetSportTeams(sport, {
    query: { enabled: !!pool, queryKey: ["teams", sport] },
  });

  const updatePool = useUpdatePool();
  const processResults = useProcessResults();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [week, setWeek] = useState<number>(1);
  const [losingTeams, setLosingTeams] = useState<string>("");
  const [processingWeek, setProcessingWeek] = useState<number>(1);
  const [showAbbrevs, setShowAbbrevs] = useState(false);
  const [lastDebug, setLastDebug] = useState<ProcessDebug | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [confirmRecurringOpen, setConfirmRecurringOpen] = useState(false);

  // Sandbox controls state
  const [sandboxWeek, setSandboxWeek] = useState<number>(1);
  const [localSandboxMode, setLocalSandboxMode] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ week: number; graded: number } | null>(null);

  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (pool && initRef.current !== pool.id) {
      initRef.current = pool.id;
      setName(pool.name);
      setDesc(pool.description || "");
      setWeek(pool.currentWeek);
      setProcessingWeek(pool.currentWeek);
      const sw = (pool as any).sandboxWeek ?? pool.currentWeek;
      setSandboxWeek(sw);
      setLocalSandboxMode((pool as any).sandboxMode ?? false);
    }
  }, [pool]);

  const handleToggleSandbox = async (enabled: boolean) => {
    setTogglingMode(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/pools/${poolId}/sandbox-mode`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sandboxMode: enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setLocalSandboxMode(enabled);
      const schedLabel = sport === "nhl" ? "2025-26 NHL schedule" : "2025 NFL schedule";
      toast({ title: enabled ? "Sandbox enabled" : "Sandbox disabled", description: enabled ? `Picks now use the ${schedLabel}.` : "Picks now use live schedule." });
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to toggle sandbox", description: (err as Error).message });
    } finally {
      setTogglingMode(false);
    }
  };

  const handleLoadSandboxWeek = async () => {
    setLoadingWeek(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/schedule/sandbox-week`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: sandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `Week ${sandboxWeek} loaded`, description: "Game slate updated for sandbox week." });
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
      queryClient.invalidateQueries({ queryKey: ["pool-schedule", poolId] });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load week", description: (err as Error).message });
    } finally {
      setLoadingWeek(false);
    }
  };

  const handleSimulateGrading = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const token = localStorage.getItem("auth_token");
      // Pick'em and NHL Crazy 8s both use the pickem simulate-grading route
      const simulateUrl = (pool?.poolType === "pickem" || (pool?.poolType as string) === "crazy_8s")
        ? `/api/pools/${poolId}/pickem/simulate-grading`
        : `/api/pools/${poolId}/picks/simulate-grading`;
      const res = await fetch(simulateUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: sandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setSimResult({ week: data.week, graded: data.graded });
      toast({ title: "Grading complete", description: `${data.graded} picks graded for week ${data.week}.` });
      queryClient.invalidateQueries({ queryKey: getGetResultsQueryKey(poolId) });
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
    } catch (err) {
      toast({ variant: "destructive", title: "Simulation failed", description: (err as Error).message });
    } finally {
      setSimulating(false);
    }
  };

  const handleUpdate = () => {
    updatePool.mutate(
      { poolId, data: { name, description: desc, currentWeek: week } } as any,
      {
        onSuccess: () => {
          toast({ title: "Settings Saved", description: "Pool configuration updated." });
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
        },
      }
    );
  };

  const handleProcess = () => {
    const ids = losingTeams.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    if (ids.length === 0) return;

    processResults.mutate(
      { poolId, data: { week: processingWeek, losingTeamIds: ids } } as any,
      {
        onSuccess: (res: any) => {
          setLastDebug(res.debug ?? null);
          setShowDebug(true);
          toast({
            title: "Results Processed",
            description: `${res.eliminated.length} eliminated, ${res.survived.length} survived.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetResultsQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
          setLosingTeams("");
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Failed to process",
            description: err?.message || "An error occurred",
          });
        },
      }
    );
  };

  const copyInvite = () => {
    if (pool?.inviteCode) {
      navigator.clipboard.writeText(pool.inviteCode);
      toast({ title: "Invite code copied!" });
    }
  };

  const copyInviteLink = () => {
    if (pool?.inviteCode) {
      navigator.clipboard.writeText(`${window.location.origin}/join/${pool.inviteCode}`);
      toast({ title: "Invite link copied!", description: "Share it with anyone to let them join." });
    }
  };

  if (loadingPool || !pool) return <Skeleton className="h-[400px] w-full" />;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Invite Code */}
      <Card className="bg-card border-border/50 overflow-hidden relative">
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.1),transparent)] pointer-events-none" />
        <CardHeader>
          <CardTitle className="font-bebas text-3xl tracking-wide text-primary">Invite Code</CardTitle>
          <CardDescription>Share this code to let sharks into the pool.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
              {pool.inviteCode}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={copyInvite} className="font-bebas text-xl tracking-wider" data-testid="button-copy-invite">
                <Copy className="w-5 h-5 mr-2" /> Copy Code
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                onClick={copyInviteLink}
              >
                <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Settings */}
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-muted-foreground" /> Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide">Pool Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="bg-background/50 border-border" />
            </div>
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide">Description</Label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} className="bg-background/50 border-border min-h-[100px]" />
            </div>
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide">Current Week</Label>
              <Input type="number" value={week} onChange={e => setWeek(parseInt(e.target.value))} className="bg-background/50 border-border w-1/2" />
              <p className="text-xs text-muted-foreground">Update this when a new week begins.</p>
            </div>
            <Button onClick={handleUpdate} disabled={updatePool.isPending} className="w-full font-bebas text-xl tracking-wider h-12 mt-2">
              {updatePool.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>

        {/* Process Eliminations */}
        <Card className="bg-[linear-gradient(145deg,rgba(220,38,38,0.05)_0%,rgba(10,14,26,1)_100%)] border-destructive/30">
          <CardHeader>
            <CardTitle className="font-bebas text-2xl tracking-wide text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Process Eliminations
            </CardTitle>
            <CardDescription className="text-muted-foreground/80">
              {pool.poolType === "weekly"
                ? "Grade picks for this week. All players automatically reset to alive afterwards — weekly pools don't carry eliminations forward."
                : pool.poolType === "mid_season"
                ? `Grade picks and permanently eliminate players. Mid Season pool — started at week ${pool.startWeek ?? "?"}.`
                : "Grade picks and permanently eliminate players who chose losing teams."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide text-destructive/80">Processing Week</Label>
              <Input
                type="number"
                value={processingWeek}
                onChange={e => setProcessingWeek(parseInt(e.target.value))}
                className="bg-background/50 border-destructive/20 w-1/2"
              />
            </div>

            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide text-destructive/80">Losing Teams</Label>
              <Input
                placeholder="e.g. BAL, ATL, NYY"
                value={losingTeams}
                onChange={e => setLosingTeams(e.target.value.toUpperCase())}
                className="bg-background/50 border-destructive/20 font-mono uppercase"
                data-testid="input-losing-teams"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated abbreviations of teams that <strong>lost</strong> this week.
              </p>
            </div>

            {/* Team abbreviation cheat-sheet */}
            {teams && teams.length > 0 && (
              <div className="rounded-md border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAbbrevs(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                >
                  <span>Valid {sport.toUpperCase()} Abbreviations</span>
                  {showAbbrevs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showAbbrevs && (
                  <div className="px-3 pb-3 pt-1 bg-background/30 grid grid-cols-3 gap-x-2 gap-y-1 max-h-48 overflow-y-auto">
                    {teams.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          const existing = losingTeams.split(",").map(s => s.trim()).filter(Boolean);
                          if (!existing.includes(t.abbreviation.toUpperCase())) {
                            setLosingTeams(existing.length ? existing.join(", ") + ", " + t.abbreviation : t.abbreviation);
                          }
                        }}
                        className="flex items-center gap-1.5 text-left hover:bg-muted/30 rounded px-1 py-0.5 transition-colors group"
                        title={t.name}
                      >
                        <span className="font-mono text-xs font-bold text-primary group-hover:text-primary/80 w-9 shrink-0">
                          {t.abbreviation}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate leading-tight">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              variant="destructive"
              onClick={handleProcess}
              disabled={processResults.isPending || !losingTeams.trim()}
              className="w-full font-bebas text-xl tracking-wider h-12 mt-2"
              data-testid="button-process-results"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              {processResults.isPending ? "Processing..." : "Process Week Results"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Stop Recurring — MLB Daily and MLB Weekly pools */}
      {pool.sport === "mlb" && ((pool as any).pickFrequency === "daily" || (pool as any).pickFrequency === "weekly") && (
        pool.isRecurring ? (
          <Card className="border-destructive/30 bg-[linear-gradient(145deg,rgba(220,38,38,0.05)_0%,rgba(10,14,26,1)_100%)]">
            <CardHeader>
              <CardTitle className="font-bebas text-2xl tracking-wide text-destructive flex items-center gap-2">
                <OctagonX className="w-5 h-5" /> End Recurring Pool
              </CardTitle>
              <CardDescription className="text-muted-foreground/80">
                {(pool as any).pickFrequency === "weekly"
                  ? "Stop this pool from auto-generating new weeks. The current week will complete normally, then the pool closes."
                  : "Stop this pool from auto-generating new days. The current day will complete normally, then the pool closes."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog open={confirmRecurringOpen} onOpenChange={setConfirmRecurringOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full font-bebas text-xl tracking-wider h-12">
                    <OctagonX className="w-5 h-5 mr-2" /> End Recurring Pool
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End Recurring Pool?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {(pool as any).pickFrequency === "weekly"
                        ? "This pool will finish this week's results normally, then stop generating new weeks. This cannot be undone."
                        : "This pool will finish today's results normally, then stop generating new days. This cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bebas text-xl tracking-wider"
                      disabled={updatePool.isPending}
                      onClick={() => {
                        updatePool.mutate({ poolId, data: { isRecurring: false } }, {
                          onSuccess: () => {
                            toast({
                              title: (pool as any).pickFrequency === "weekly" ? "Pool will end after this week" : "Pool will end after today",
                              description: (pool as any).pickFrequency === "weekly"
                                ? "No new weeks will be generated after the current week closes."
                                : "No new days will be generated after the current cycle closes.",
                            });
                            queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
                            setConfirmRecurringOpen(false);
                          },
                          onError: (err: any) => {
                            toast({ variant: "destructive", title: "Failed", description: (err as Error).message });
                          },
                        });
                      }}
                    >
                      End Recurring Pool
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/30 bg-card">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-muted-foreground">
                <OctagonX className="w-5 h-5 text-destructive/60 shrink-0 mt-0.5" />
                <p className="text-sm">
                  {(pool as any).pickFrequency === "weekly"
                    ? "This pool will end after the current week completes. No new weeks will be generated."
                    : "This pool will end after the current cycle completes. No new days will be generated."}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* Sandbox Mode — NFL/NHL survivor + NHL weekly Pick'em + NHL Crazy 8s, super admin only */}
      {(pool.sport === "nfl" || pool.sport === "nhl") && (
        ["season", "weekly", "mid_season"].includes(pool.poolType) ||
        (pool.poolType === "pickem" && (pool as any).pickFrequency === "weekly") ||
        ((pool.poolType as string) === "crazy_8s" && pool.sport === "nhl")
      ) && isSuperAdmin && (
        <Card className="border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,rgba(10,14,26,1)_100%)]">
          <CardHeader>
            <CardTitle className="font-bebas text-2xl tracking-wide text-yellow-400 flex items-center gap-2">
              <Zap className="w-5 h-5" /> Sandbox Mode
            </CardTitle>
            <CardDescription className="text-muted-foreground/80">
              {sport === "nhl"
                ? "Use the 2025-26 NHL regular-season schedule for testing — picks are always unlocked in sandbox."
                : "Use the 2025 NFL schedule for testing — picks are always unlocked in sandbox."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-foreground">Enable Sandbox</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sport === "nhl" ? "Serve 2025-26 NHL games instead of live schedule" : "Serve 2025 NFL games instead of live schedule"}
                </p>
              </div>
              <Switch checked={localSandboxMode} disabled={togglingMode} onCheckedChange={handleToggleSandbox} />
            </div>
            {localSandboxMode && (
              <>
                <div className="flex items-end gap-3">
                  <div className="grid gap-2 flex-1 max-w-[160px]">
                    <Label className="font-bebas text-lg tracking-wide text-yellow-300/80">
                      {sport === "nhl" ? "Week (1–26)" : "Week (1–18)"}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={sport === "nhl" ? 26 : 18}
                      value={sandboxWeek}
                      onChange={e => {
                        const max = sport === "nhl" ? 26 : 18;
                        setSandboxWeek(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)));
                      }}
                      className="bg-background/50 border-yellow-500/20 w-full"
                    />
                  </div>
                  <Button
                    onClick={handleLoadSandboxWeek}
                    disabled={loadingWeek}
                    className="h-10 font-bebas text-lg tracking-wider bg-yellow-600 hover:bg-yellow-500 text-black shrink-0"
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    {loadingWeek ? "Loading…" : "Load Week"}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSimulateGrading}
                    disabled={simulating}
                    variant="outline"
                    className="font-bebas text-lg tracking-wider border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
                  >
                    <BarChart3 className="w-4 h-4 mr-1.5" />
                    {simulating ? "Grading…" : "Simulate Grading"}
                  </Button>
                  {simResult && (
                    <span className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {simResult.graded} picks graded for week {simResult.week}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  "Load Week" updates the pool's current week so picks target that week's games.
                  "Simulate Grading" scores all pending picks against the sandbox schedule's final results.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug output panel — shown after a process run */}
      {lastDebug && (
        <Card className="border-border/30 bg-background/50">
          <CardHeader className="pb-2">
            <button
              type="button"
              onClick={() => setShowDebug(v => !v)}
              className="flex items-center gap-2 text-left"
            >
              <Bug className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="font-bebas text-xl tracking-wide text-muted-foreground">
                Process Debug — Week {processingWeek - 1}
              </CardTitle>
              {showDebug ? <ChevronUp className="w-4 h-4 ml-auto text-muted-foreground" /> : <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />}
            </button>
          </CardHeader>
          {showDebug && (
            <CardContent className="space-y-4 text-sm font-mono">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">You entered</p>
                <p className="text-foreground">{lastDebug.inputEntered.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Resolved to team IDs</p>
                {lastDebug.resolvedLosingIds.length === 0 ? (
                  <p className="text-destructive">⚠ No valid abbreviations matched — check spelling against the cheat-sheet above</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {lastDebug.resolvedLosingIds.map(t => (
                      <span key={t.id} className="bg-destructive/20 border border-destructive/30 text-destructive px-2 py-0.5 rounded text-xs">
                        {t.abbreviation} (id {t.id})
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Pick results</p>
                {lastDebug.picks.length === 0 ? (
                  <p className="text-muted-foreground">No picks found for this week</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-1 pr-3 text-muted-foreground font-normal">User</th>
                        <th className="text-left py-1 pr-3 text-muted-foreground font-normal">Team</th>
                        <th className="text-left py-1 pr-3 text-muted-foreground font-normal">Abbrev</th>
                        <th className="text-left py-1 text-muted-foreground font-normal">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastDebug.picks.map((p, i) => (
                        <tr key={i} className="border-b border-border/20">
                          <td className="py-1 pr-3 text-muted-foreground">{p.userId}</td>
                          <td className="py-1 pr-3">{p.teamName}</td>
                          <td className="py-1 pr-3 text-primary">{p.abbreviation}</td>
                          <td className={`py-1 font-bold ${p.result === "loss" ? "text-destructive" : "text-green-500"}`}>
                            {p.result.toUpperCase()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {lastDebug.forfeits.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Forfeits (no pick)</p>
                  <p className="text-destructive">User IDs: {lastDebug.forfeits.join(", ")}</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
