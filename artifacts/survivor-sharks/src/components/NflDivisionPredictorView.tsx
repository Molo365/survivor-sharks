import { useState, useEffect } from "react";
import {
  useGetNdpDivisions,
  useSubmitNdpPicks,
  useGetNdpLeaderboard,
  getGetNdpLeaderboardQueryKey,
  useGetNdpMemberPicks,
  getGetNdpMemberPicksQueryKey,
  useGetPool,
  useUpdatePool,
  getGetPoolQueryKey,
  useGetNdpWeek18Games,
  useGetNdpMyTiebreaker,
  getGetNdpMyTiebreakerQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Zap,
  BarChart3,
  Circle,
  ListOrdered,
  Send,
  Trophy,
  Medal,
  ShieldAlert,
  Copy,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  poolId: number;
  isCommissioner?: boolean;
  inviteCode?: string | null;
  sandboxMode?: boolean;
  isSuperAdmin?: boolean;
}

type TeamOrder = [string, string, string, string];

type PickGrade = "correct" | "partial" | "wrong";

function getPickGrade(teamName: string, idx: number, actual: [string, string, string, string]): PickGrade {
  if (actual[idx] === teamName) return "correct";
  if (idx < 2 && actual.indexOf(teamName) >= 0 && actual.indexOf(teamName) < 2) return "partial";
  return "wrong";
}

const GRADE_ROW: Record<PickGrade, string> = {
  correct: "bg-green-500/10 border-green-500/30",
  partial: "bg-amber-500/10 border-amber-500/30",
  wrong: "bg-background/30 border-border/10 opacity-60",
};

const GRADE_NAME: Record<PickGrade, string> = {
  correct: "text-green-400",
  partial: "text-amber-400",
  wrong: "text-muted-foreground",
};

const GRADE_PTS: Record<PickGrade, string | null> = {
  correct: "+3",
  partial: "+1",
  wrong: null,
};

const POSITION_STYLES = [
  { label: "1st", bg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
  { label: "2nd", bg: "bg-slate-400/20 text-slate-300 border-slate-400/40" },
  { label: "3rd", bg: "bg-orange-600/20 text-orange-400 border-orange-600/40" },
  { label: "4th", bg: "bg-muted/40 text-muted-foreground border-border/40" },
];

const RANK_STYLES = [
  { icon: "🥇", bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300" },
  { icon: "🥈", bg: "bg-slate-400/10 border-slate-400/30 text-slate-300" },
  { icon: "🥉", bg: "bg-orange-600/10 border-orange-600/30 text-orange-400" },
];

// NFL season starts early September 2026 — picks lock then
const PICKS_LOCK_DATE = new Date("2026-09-04T17:00:00Z");

// ── Player picks modal ────────────────────────────────────────────────────────

function PlayerPicksModal({
  poolId,
  userId,
  displayName,
  onClose,
}: {
  poolId: number;
  userId: number;
  displayName: string;
  onClose: () => void;
}) {
  const { data: divisions, isLoading } = useGetNdpMemberPicks(poolId, userId, {
    query: { queryKey: getGetNdpMemberPicksQueryKey(poolId, userId) },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background border-border/60 p-0">
        <DialogHeader className="flex flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle className="font-bebas text-2xl tracking-wider text-foreground leading-none">
            <span className="text-yellow-400">{displayName}</span>
            <span className="text-muted-foreground">'s Predictions</span>
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="px-6 pb-6 pt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : !divisions || divisions.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No predictions found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {divisions.map((div) => {
                const teamByName = new Map(div.teams.map((t) => [t.name, t]));
                const order = div.myPick
                  ? [div.myPick.pos1Team, div.myPick.pos2Team, div.myPick.pos3Team, div.myPick.pos4Team]
                  : null;
                const actual = div.actualResult
                  ? [div.actualResult.pos1Team, div.actualResult.pos2Team, div.actualResult.pos3Team, div.actualResult.pos4Team] as [string, string, string, string]
                  : null;

                return (
                  <div
                    key={div.name}
                    className={cn(
                      "rounded-xl border p-3 bg-card",
                      order ? "border-border/50" : "border-border/30 opacity-60",
                    )}
                  >
                    <p className="font-bebas text-lg tracking-wider text-foreground mb-2 flex items-center gap-1.5">
                      <span className="text-yellow-400/70 text-sm">DIV</span>
                      {div.name}
                    </p>

                    {order ? (
                      <div className="flex flex-col gap-1.5">
                        {order.map((teamName, idx) => {
                          const team = teamByName.get(teamName);
                          const pos = POSITION_STYLES[idx];
                          const grade = actual ? getPickGrade(teamName, idx, actual) : null;
                          const pts = grade ? GRADE_PTS[grade] : null;
                          return (
                            <div
                              key={teamName}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 border",
                                grade ? GRADE_ROW[grade] : "bg-background/50 border-border/20",
                              )}
                            >
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 w-9 text-center shrink-0",
                                pos.bg,
                              )}>
                                {pos.label}
                              </span>
                              {team?.logoUrl ? (
                                <img
                                  src={team.logoUrl}
                                  alt={team.name}
                                  className="w-7 h-7 object-contain rounded-sm shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-sm bg-muted/50 flex items-center justify-center shrink-0">
                                  <span className="text-[8px] text-muted-foreground font-bold">
                                    {team?.abbr?.slice(0, 3)}
                                  </span>
                                </div>
                              )}
                              <span className={cn(
                                "flex-1 text-sm font-medium truncate",
                                grade ? GRADE_NAME[grade] : "text-foreground",
                              )}>
                                {team?.name ?? teamName}
                              </span>
                              {pts && (
                                <span className={cn(
                                  "text-[10px] font-bold shrink-0",
                                  grade === "correct" ? "text-green-400" : "text-amber-400",
                                )}>
                                  {pts}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-3 text-center">
                        No pick submitted
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Leaderboard tab ──────────────────────────────────────────────────────────

function LeaderboardTab({ poolId }: { poolId: number }) {
  const { user } = useAuth();
  const { data: leaderboard, isLoading } = useGetNdpLeaderboard(poolId, {
    query: { queryKey: getGetNdpLeaderboardQueryKey(poolId), refetchInterval: 60_000 },
  });
  const [selectedPlayer, setSelectedPlayer] = useState<{ userId: number; displayName: string } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Trophy className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground">No members in this pool yet.</p>
      </div>
    );
  }

  const divisionsScored = leaderboard[0]?.divisionScores.filter((d) => d.hasResult).length ?? 0;

  return (
    <>
      {selectedPlayer && (
        <PlayerPicksModal
          poolId={poolId}
          userId={selectedPlayer.userId}
          displayName={selectedPlayer.displayName}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Medal className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium">Division Results Entered</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-bebas text-xl tracking-wider",
              divisionsScored === 8 ? "text-yellow-400" : "text-foreground",
            )}>
              {divisionsScored}
            </span>
            <span className="text-muted-foreground font-bebas text-xl">/8</span>
            {divisionsScored === 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                Leaderboard updates as results are entered
              </span>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Click on a player's name to view their predictions!
        </p>

        <div className="space-y-2">
          {leaderboard.map((entry) => {
            const isMe = entry.userId === user?.id;
            const rankStyle = RANK_STYLES[entry.rank - 1];
            const pct = divisionsScored > 0 ? (entry.totalScore / (divisionsScored * 12)) * 100 : 0;
            const displayName = entry.displayName || entry.username;

            return (
              <div
                key={entry.userId}
                className={cn(
                  "rounded-xl border px-4 py-3 transition-all",
                  isMe
                    ? "border-primary/40 bg-primary/5 shadow-[0_0_16px_rgba(var(--primary-rgb),0.06)]"
                    : "border-border/50 bg-card hover:border-border",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 font-bebas text-lg",
                    rankStyle
                      ? rankStyle.bg
                      : "bg-muted/30 border-border/40 text-muted-foreground",
                  )}>
                    {rankStyle ? rankStyle.icon : `#${entry.rank}`}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPlayer({ userId: entry.userId, displayName })}
                    className="flex-1 min-w-0 text-left group"
                  >
                    <p className={cn(
                      "font-medium truncate group-hover:underline decoration-dotted underline-offset-2 transition-colors",
                      isMe ? "text-primary" : "group-hover:text-yellow-400",
                    )}>
                      {displayName}
                      {isMe && <span className="ml-1.5 text-xs text-primary/60 font-normal no-underline">(you)</span>}
                    </p>
                    {entry.finalWinner && (
                      <span className="inline-flex items-center gap-1 text-yellow-400 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                        <Trophy className="w-3 h-3 shrink-0" />
                        Winner
                      </span>
                    )}
                    <div className="mt-1.5 h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          entry.rank === 1 ? "bg-yellow-400" : isMe ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>

                  <div className="text-right shrink-0">
                    <p className="font-bebas text-2xl tracking-wider leading-none">
                      <span className={entry.totalScore > 0 ? "text-foreground" : "text-muted-foreground"}>
                        {entry.totalScore}
                      </span>
                      <span className="text-muted-foreground text-base"> / 96</span>
                    </p>
                    {divisionsScored > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {divisionsScored} division{divisionsScored !== 1 ? "s" : ""} scored
                      </p>
                    )}
                    {entry.prizeWon != null && (
                      <p className="text-[11px] text-yellow-400 font-bold mt-0.5">
                        ${entry.prizeWon.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {divisionsScored === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Scores will appear here once the pool commissioner enters actual division results.
          </p>
        )}
      </div>
    </>
  );
}

// ── Commissioner tab ──────────────────────────────────────────────────────────

function CommissionerTab({ poolId, inviteCode, sandboxMode: initSandboxMode = false, isSuperAdmin = false }: {
  poolId: number;
  inviteCode: string;
  sandboxMode?: boolean;
  isSuperAdmin?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: pool } = useGetPool(poolId);
  const { data: week18Games = [], isLoading: loadingGames } = useGetNdpWeek18Games(poolId);
  const updatePool = useUpdatePool();
  const [localSandboxMode, setLocalSandboxMode] = useState(initSandboxMode);
  const [togglingMode, setTogglingMode] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ simulated: number; closedPool?: boolean; winnerIds?: number[] } | null>(null);
  const [simTb1Score, setSimTb1Score] = useState("");
  const [simTb2Score, setSimTb2Score] = useState("");
  const [tb1, setTb1] = useState<string>("");
  const [tb2, setTb2] = useState<string>("");
  const [savingTb, setSavingTb] = useState(false);

  useEffect(() => {
    if (!pool) return;
    setTb1((pool as any).ndpTb1GameId ?? "");
    setTb2((pool as any).ndpTb2GameId ?? "");
  }, [pool?.id]);

  const handleToggleSandbox = async (enabled: boolean) => {
    setTogglingMode(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/pools/${poolId}/sandbox-mode`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sandboxMode: enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setLocalSandboxMode(enabled);
      toast({ title: enabled ? "Sandbox enabled" : "Sandbox disabled" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: (err as Error).message });
    } finally { setTogglingMode(false); }
  };

  const handleSimulateStandings = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const token = localStorage.getItem("auth_token");
      const tb1 = simTb1Score !== "" ? parseInt(simTb1Score, 10) : undefined;
      const tb2 = simTb2Score !== "" ? parseInt(simTb2Score, 10) : undefined;
      const res = await fetch(`/api/pools/${poolId}/ndp/simulate-standings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...(tb1 !== undefined && !isNaN(tb1) && { tb1CombinedScore: tb1 }),
          ...(tb2 !== undefined && !isNaN(tb2) && { tb2CombinedScore: tb2 }),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setSimResult({ simulated: data.simulated, closedPool: data.closedPool, winnerIds: data.winnerIds });
      if (data.closedPool) {
        const count = data.winnerIds?.length ?? 0;
        toast({
          title: "Pool closed!",
          description: count === 1
            ? "Single winner declared via tiebreaker."
            : `${count} co-winner${count !== 1 ? "s" : ""} declared.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
      } else {
        toast({
          title: "Standings simulated",
          description: `${data.simulated} divisions randomized.${data.closureWarning ? " Note: " + data.closureWarning : ""}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["ndp-leaderboard", poolId] });
    } catch (err) {
      toast({ variant: "destructive", title: "Simulation failed", description: (err as Error).message });
    } finally { setSimulating(false); }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteCode);
    toast({ title: "Invite code copied to clipboard!" });
  };

  const copyLink = () => {
    const url = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Invite link copied!", description: url });
  };

  return (
    <div className="pt-4 max-w-xl space-y-6">
      {isSuperAdmin && (
        <div className="rounded-xl border border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,rgba(10,14,26,1)_100%)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bebas text-xl tracking-wide text-yellow-400 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Sandbox Mode
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">Randomly simulate final division standings</p>
            </div>
            <Switch checked={localSandboxMode} disabled={togglingMode} onCheckedChange={handleToggleSandbox} />
          </div>
          {localSandboxMode && (
            <div className="space-y-3">
              {pool?.ndpTb1GameId && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-yellow-400/70 uppercase tracking-wider font-semibold">
                      TB1 Combined Pts
                    </label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 47"
                      value={simTb1Score}
                      onChange={(e) => setSimTb1Score(e.target.value)}
                      className="h-8 text-sm bg-background/50 border-yellow-500/30"
                    />
                  </div>
                  {pool.ndpTb2GameId && (
                    <div className="space-y-1">
                      <label className="text-xs text-yellow-400/70 uppercase tracking-wider font-semibold">
                        TB2 Combined Pts
                      </label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 38"
                        value={simTb2Score}
                        onChange={(e) => setSimTb2Score(e.target.value)}
                        className="h-8 text-sm bg-background/50 border-yellow-500/30"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSimulateStandings}
                  disabled={simulating}
                  variant="outline"
                  className="font-bebas text-lg tracking-wider border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
                >
                  <BarChart3 className="w-4 h-4 mr-1.5" />
                  {simulating ? "Simulating…" : "Simulate Standings"}
                </Button>
                {simResult && (
                  <span className="text-xs text-yellow-400 font-semibold">
                    {simResult.closedPool
                      ? `Pool closed — ${simResult.winnerIds?.length ?? 0} winner(s)`
                      : `${simResult.simulated} divisions randomized`}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tiebreaker Game Designation */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
        <div>
          <h4 className="font-bebas text-xl tracking-wide text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Tiebreaker Games
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Designate the final-week games used to break score ties at pool close.
          </p>
        </div>
        {loadingGames ? (
          <p className="text-xs text-muted-foreground">Loading games…</p>
        ) : week18Games.length === 0 ? (
          <p className="text-xs text-muted-foreground">No Week 18 games available yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Primary</Label>
              <Select value={tb1} onValueChange={setTb1}>
                <SelectTrigger className="h-9 bg-background border-border/50 text-sm">
                  <SelectValue placeholder="Pick primary tiebreaker game" />
                </SelectTrigger>
                <SelectContent>
                  {week18Games.map(g => (
                    <SelectItem key={g.id} value={g.id} disabled={g.id === tb2}>
                      {g.awayTeam} @ {g.homeTeam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Secondary (fallback)</Label>
              <Select value={tb2} onValueChange={setTb2}>
                <SelectTrigger className="h-9 bg-background border-border/50 text-sm">
                  <SelectValue placeholder="Pick secondary tiebreaker game" />
                </SelectTrigger>
                <SelectContent>
                  {week18Games.map(g => (
                    <SelectItem key={g.id} value={g.id} disabled={g.id === tb1}>
                      {g.awayTeam} @ {g.homeTeam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={savingTb || (!tb1 && !tb2)}
              onClick={() => {
                setSavingTb(true);
                updatePool.mutate({ poolId, data: { ndpTb1GameId: tb1 || null, ndpTb2GameId: tb2 || null } as any }, {
                  onSuccess: () => {
                    toast({ title: "Tiebreaker games saved" });
                    queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
                  },
                  onError: (err: any) => {
                    toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
                  },
                  onSettled: () => setSavingTb(false),
                });
              }}
              className="font-bebas tracking-wider"
            >
              {savingTb ? "Saving…" : "Save Tiebreaker Games"}
            </Button>
            {pool && ((pool as any).ndpTb1GameId || (pool as any).ndpTb2GameId) && (
              <p className="text-xs text-muted-foreground">
                Saved — Primary: {week18Games.find(g => g.id === (pool as any).ndpTb1GameId)?.awayTeam ?? "—"} @ {week18Games.find(g => g.id === (pool as any).ndpTb1GameId)?.homeTeam ?? "—"}
                {(pool as any).ndpTb2GameId && (
                  <> · Secondary: {week18Games.find(g => g.id === (pool as any).ndpTb2GameId)?.awayTeam ?? "—"} @ {week18Games.find(g => g.id === (pool as any).ndpTb2GameId)?.homeTeam ?? "—"}</>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">Invite Code</h4>
            <p className="text-sm text-muted-foreground">Share this code to let players join the pool.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
              {inviteCode}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={copyInvite} className="font-bebas text-xl tracking-wider">
                <Copy className="w-5 h-5 mr-2" /> Copy Code
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={copyLink}
                className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
              >
                <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── My Picks tab ──────────────────────────────────────────────────────────────

function MyPicksTab({ poolId }: { poolId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: divisions, isLoading } = useGetNdpDivisions(poolId);
  const submitPicks = useSubmitNdpPicks();
  const { data: poolForTb } = useGetPool(poolId);
  const { data: myTiebreaker } = useGetNdpMyTiebreaker(poolId);
  const { data: week18Games = [] } = useGetNdpWeek18Games(poolId);

  const [orders, setOrders] = useState<Record<string, TeamOrder>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [savedOrders, setSavedOrders] = useState<Record<string, TeamOrder>>({});
  const [initialised, setInitialised] = useState(false);
  const [showTbDialog, setShowTbDialog] = useState(false);
  const [tbGuess1, setTbGuess1] = useState("");
  const [tbGuess2, setTbGuess2] = useState("");

  useEffect(() => {
    if (!divisions || initialised) return;
    const newOrders: Record<string, TeamOrder> = {};
    const newSaved: Record<string, TeamOrder> = {};
    const newConfirmed = new Set<string>();
    for (const div of divisions) {
      if (div.myPick) {
        const savedOrder: TeamOrder = [
          div.myPick.pos1Team,
          div.myPick.pos2Team,
          div.myPick.pos3Team,
          div.myPick.pos4Team,
        ];
        newOrders[div.name] = savedOrder;
        newSaved[div.name] = savedOrder;
        newConfirmed.add(div.name);
      } else {
        newOrders[div.name] = div.teams.map((t) => t.name) as TeamOrder;
      }
    }
    setOrders(newOrders);
    setSavedOrders(newSaved);
    setConfirmed(newConfirmed);
    setInitialised(true);
  }, [divisions, initialised]);

  function moveTeam(divisionName: string, fromIdx: number, toIdx: number) {
    setOrders((prev) => {
      const order = [...(prev[divisionName] ?? [])] as TeamOrder;
      const [moved] = order.splice(fromIdx, 1);
      order.splice(toIdx, 0, moved);
      return { ...prev, [divisionName]: order as TeamOrder };
    });
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(divisionName);
      return next;
    });
  }

  function confirmDivision(divisionName: string) {
    setConfirmed((prev) => new Set([...prev, divisionName]));
  }

  const picksLocked = new Date() >= PICKS_LOCK_DATE;
  const confirmedCount = confirmed.size;
  const totalDivisions = divisions?.length ?? 8;
  const allConfirmed = confirmedCount === totalDivisions;

  const hasPendingChanges = allConfirmed && Array.from(confirmed).some((d) => {
    const saved = savedOrders[d];
    const current = orders[d];
    if (!saved) return true;
    if (!current) return false;
    return current.some((t, i) => t !== saved[i]);
  });

  const needsTb = !!(poolForTb?.ndpTb1GameId) && myTiebreaker?.tb1Guess == null;

  function doFinalSubmit(tb1Guess?: number, tb2Guess?: number) {
    const picks = Object.entries(orders).map(([divisionName, order]) => ({
      divisionName,
      pos1Team: order[0],
      pos2Team: order[1],
      pos3Team: order[2],
      pos4Team: order[3],
    }));
    submitPicks.mutate(
      {
        poolId,
        data: {
          picks,
          ...(typeof tb1Guess === "number" && { tb1Guess }),
          ...(typeof tb2Guess === "number" && { tb2Guess }),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Picks locked in! 🏈", description: "All 8 division predictions have been saved." });
          setSavedOrders({ ...orders });
          queryClient.invalidateQueries({ queryKey: ["getNdpDivisions", poolId] });
          queryClient.invalidateQueries({ queryKey: getGetNdpMyTiebreakerQueryKey(poolId) });
        },
        onError: () => {
          toast({ title: "Submission failed", description: "Something went wrong. Please try again.", variant: "destructive" });
        },
      },
    );
  }

  function handleSubmit() {
    if (!allConfirmed) return;
    if (needsTb) {
      setTbGuess1("");
      setTbGuess2("");
      setShowTbDialog(true);
      return;
    }
    doFinalSubmit();
  }

  if (isLoading || !divisions) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const tb1Game = week18Games.find((g) => g.id === poolForTb?.ndpTb1GameId);
  const tb2Game = week18Games.find((g) => g.id === poolForTb?.ndpTb2GameId);

  return (
    <div className="space-y-6 pt-4">
      {/* Tiebreaker Dialog — prompted once on first picks submission when games are designated */}
      <Dialog open={showTbDialog} onOpenChange={(open) => { if (!open) setShowTbDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" /> Tiebreaker Guess
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-snug">
              In case of a score tie at pool close, your guess for the combined points scored in these final-week games decides the winner. Closest guess wins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Primary Game{tb1Game ? ` — ${tb1Game.awayTeam} @ ${tb1Game.homeTeam}` : ""}
              </label>
              <Input
                type="number"
                min={0}
                placeholder="Combined pts (e.g. 47)"
                value={tbGuess1}
                onChange={(e) => setTbGuess1(e.target.value)}
                className="text-lg font-mono h-12"
                autoFocus
              />
            </div>
            {poolForTb?.ndpTb2GameId && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Secondary Game{tb2Game ? ` — ${tb2Game.awayTeam} @ ${tb2Game.homeTeam}` : ""}
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Combined pts (e.g. 38)"
                  value={tbGuess2}
                  onChange={(e) => setTbGuess2(e.target.value)}
                  className="text-lg font-mono h-12"
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTbDialog(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 font-bebas text-xl tracking-widest"
              onClick={() => {
                const g1 = parseInt(tbGuess1, 10);
                if (isNaN(g1) || g1 < 0) {
                  toast({ variant: "destructive", title: "Enter a valid guess", description: "Primary tiebreaker guess must be ≥ 0." });
                  return;
                }
                const g2 = tbGuess2 !== "" ? parseInt(tbGuess2, 10) : undefined;
                if (g2 !== undefined && (isNaN(g2) || g2 < 0)) {
                  toast({ variant: "destructive", title: "Enter a valid guess", description: "Secondary tiebreaker guess must be ≥ 0." });
                  return;
                }
                setShowTbDialog(false);
                doFinalSubmit(g1, g2);
              }}
            >
              Submit Picks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {picksLocked ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <span className="text-lg leading-none">🔒</span>
          <div>
            <p className="font-semibold text-sm text-amber-200 leading-snug">Picks Locked — Season has begun</p>
            <p className="text-xs text-muted-foreground mt-0.5">The 2026 NFL season has kicked off. All division predictions are now final.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-card border border-border/50 rounded-full px-4 py-2 shadow-sm">
            <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="font-bebas text-xl tracking-wider">
              <span className={cn(allConfirmed ? "text-yellow-400" : "text-foreground")}>{confirmedCount}</span>
              <span className="text-muted-foreground">/{totalDivisions}</span>
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider hidden sm:block">divisions predicted</span>
          </div>
          <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", allConfirmed ? "bg-yellow-400" : "bg-primary")}
              style={{ width: `${(confirmedCount / totalDivisions) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Division cards grid — 2 cols on md, 4 on xl */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {divisions.map((div) => {
          const isConfirmed = confirmed.has(div.name);
          const order = orders[div.name] ?? (div.teams.map((t) => t.name) as TeamOrder);
          const teamByName = new Map(div.teams.map((t) => [t.name, t]));
          const actual = div.actualResult
            ? [div.actualResult.pos1Team, div.actualResult.pos2Team, div.actualResult.pos3Team, div.actualResult.pos4Team] as [string, string, string, string]
            : null;

          return (
            <div
              key={div.name}
              className={cn(
                "rounded-xl border-2 p-4 transition-all duration-200 flex flex-col gap-3",
                isConfirmed || picksLocked
                  ? "border-yellow-500/50 bg-yellow-500/5 shadow-[0_0_20px_rgba(234,179,8,0.06)]"
                  : "border-border/50 bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bebas text-xl tracking-wider text-foreground leading-tight">{div.name}</span>
                  {isConfirmed && <CheckCircle2 className="w-4 h-4 text-yellow-400 shrink-0" />}
                </div>
                {!isConfirmed && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">
                    Unranked
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {order.map((teamName, idx) => {
                  const team = teamByName.get(teamName);
                  const pos = POSITION_STYLES[idx];
                  const isFirst = idx === 0;
                  const isLast = idx === order.length - 1;
                  const grade = actual ? getPickGrade(teamName, idx, actual) : null;
                  const pts = grade ? GRADE_PTS[grade] : null;

                  return (
                    <div
                      key={teamName}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-2 border transition-colors",
                        grade
                          ? GRADE_ROW[grade]
                          : isConfirmed
                          ? "bg-background/50 border-border/30"
                          : "bg-background/30 border-border/20 hover:border-border/50",
                      )}
                    >
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 w-9 text-center shrink-0",
                        pos.bg,
                      )}>
                        {pos.label}
                      </span>
                      {team?.logoUrl ? (
                        <img
                          src={team.logoUrl}
                          alt={team.name}
                          className="w-7 h-7 object-contain shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-sm bg-muted/50 flex items-center justify-center shrink-0">
                          <span className="text-[8px] text-muted-foreground font-bold">{team?.abbr?.slice(0, 3)}</span>
                        </div>
                      )}
                      <span className={cn(
                        "flex-1 text-xs font-medium truncate leading-tight",
                        grade ? GRADE_NAME[grade] : "text-foreground",
                      )}>
                        {team?.name ?? teamName}
                      </span>
                      {pts && (
                        <span className={cn(
                          "text-[10px] font-bold shrink-0",
                          grade === "correct" ? "text-green-400" : "text-amber-400",
                        )}>
                          {pts}
                        </span>
                      )}
                      {!actual && !isConfirmed && !picksLocked && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => moveTeam(div.name, idx, idx - 1)}
                            className={cn(
                              "w-5 h-4 flex items-center justify-center rounded transition-colors",
                              isFirst ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => moveTeam(div.name, idx, idx + 1)}
                            className={cn(
                              "w-5 h-4 flex items-center justify-center rounded transition-colors",
                              isLast ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!picksLocked && (
                <div className="mt-auto pt-1">
                  {isConfirmed ? (
                    <button
                      type="button"
                      onClick={() => setConfirmed((prev) => { const n = new Set(prev); n.delete(div.name); return n; })}
                      className="w-full text-xs text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 rounded-lg py-1.5 transition-colors"
                    >
                      Edit ranking
                    </button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => confirmDivision(div.name)}
                      className="w-full bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:border-yellow-500/60"
                      variant="outline"
                    >
                      <Circle className="w-3 h-3 mr-1.5" />
                      Confirm {div.name}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!picksLocked && (hasPendingChanges || (allConfirmed && needsTb)) && (
        <div className="sticky bottom-4 flex justify-center pt-2">
          <div className="flex flex-col sm:flex-row items-center gap-3 rounded-2xl border px-6 py-4 shadow-xl backdrop-blur-sm bg-yellow-500/10 border-yellow-500/40 shadow-yellow-500/10">
            <div className="text-center sm:text-left">
              <p className="font-bebas text-xl tracking-wider text-yellow-300">
                {needsTb && !hasPendingChanges ? "Tiebreaker guess required!" : "All divisions predicted!"}
              </p>
              <p className="text-xs text-muted-foreground">
                {needsTb && !hasPendingChanges
                  ? "The commissioner has designated tiebreaker games — add your guess to finalise your entry"
                  : "Lock in your picks for all 8 NFL divisions"}
              </p>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitPicks.isPending}
              className="gap-2 font-bebas text-xl tracking-wider px-8 py-5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg shadow-yellow-500/20"
            >
              <Send className="w-5 h-5" />
              {submitPicks.isPending ? "Saving..." : needsTb ? "Submit & Add Tiebreaker" : "Submit All Picks"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function NflDivisionPredictorView({ poolId, isCommissioner, inviteCode, sandboxMode = false, isSuperAdmin = false }: Props) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bebas text-3xl tracking-wider text-foreground flex items-center gap-2">
          <ListOrdered className="w-7 h-7 text-yellow-400" />
          NFL Division Predictor
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Rank all 4 teams in each of the 8 NFL divisions by their final 2026 season standings. 3 pts exact position, 1 pt if a team finishes top-2 but in the wrong spot. Max 96 pts — highest score wins the pot. Lock in picks before the season starts!
        </p>
      </div>

      <Tabs defaultValue="picks" className="w-full">
        <div className="relative">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1 gap-1 w-max md:w-full">
            <TabsTrigger value="picks" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2">
              <ListOrdered className="w-4 h-4" /> My Picks
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2">
              <Trophy className="w-4 h-4" /> Leaderboard
            </TabsTrigger>
            {isCommissioner && (
              <TabsTrigger value="commissioner" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2 text-muted-foreground hover:text-foreground md:ml-auto">
                <ShieldAlert className="w-4 h-4" /> Commissioner
              </TabsTrigger>
            )}
          </TabsList>
          </div>
          <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
        </div>

        <TabsContent value="picks">
          <MyPicksTab poolId={poolId} />
        </TabsContent>

        <TabsContent value="leaderboard">
          <LeaderboardTab poolId={poolId} />
        </TabsContent>

        {isCommissioner && inviteCode && (
          <TabsContent value="commissioner">
            <CommissionerTab poolId={poolId} inviteCode={inviteCode} sandboxMode={sandboxMode} isSuperAdmin={isSuperAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
