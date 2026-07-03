import { useState, useEffect } from "react";
import {
  useGetGspGroups,
  useSubmitGspPicks,
  useGetGspLeaderboard,
  getGetGspLeaderboardQueryKey,
  useGetGspMemberPicks,
  getGetGspMemberPicksQueryKey,
  useGetGspLiveStandings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { CancelPoolButton } from "@/components/CancelPoolButton";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Circle,
  ListOrdered,
  Send,
  Trophy,
  Medal,
  ShieldAlert,
  Copy,
  X,
  Globe,
  RefreshCw,
  Check,
  Minus,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  poolId: number;
  isCommissioner?: boolean;
  inviteCode?: string | null;
}

type TeamOrder = [string, string, string, string];

const POSITION_STYLES = [
  { label: "1st", bg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", dot: "bg-yellow-400" },
  { label: "2nd", bg: "bg-slate-400/20 text-slate-300 border-slate-400/40",   dot: "bg-slate-400" },
  { label: "3rd", bg: "bg-orange-600/20 text-orange-400 border-orange-600/40", dot: "bg-orange-500" },
  { label: "4th", bg: "bg-muted/40 text-muted-foreground border-border/40",   dot: "bg-muted-foreground/40" },
];

const RANK_STYLES = [
  { icon: "🥇", bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300" },
  { icon: "🥈", bg: "bg-slate-400/10 border-slate-400/30 text-slate-300" },
  { icon: "🥉", bg: "bg-orange-600/10 border-orange-600/30 text-orange-400" },
];

// Returns the points earned for a single predicted position slot, given the actual standings.
// Mirrors the server-side scorePositions() logic per slot so the UI can show correct/wrong styling.
function getPositionScore(
  actual: [string, string, string, string],
  predicted: [string, string, string, string],
  slotIdx: number,
): number {
  const team = predicted[slotIdx];
  const actualPos = actual.indexOf(team);
  if (actualPos === slotIdx) return 3;
  if (slotIdx < 2 && actualPos >= 0 && actualPos < 2) return 1;
  return 0;
}

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
  const { data: groups, isLoading } = useGetGspMemberPicks(poolId, userId, {
    query: { queryKey: getGetGspMemberPicksQueryKey(poolId, userId) },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background border-border/60 p-0">
        {/* Header */}
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
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : !groups || groups.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No predictions found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map((group) => {
                const teamByName = new Map(group.teams.map((t) => [t.name, t]));
                const order = group.myPick
                  ? [group.myPick.pos1Team, group.myPick.pos2Team, group.myPick.pos3Team, group.myPick.pos4Team] as [string,string,string,string]
                  : null;
                const actual = group.result
                  ? [group.result.pos1Team, group.result.pos2Team, group.result.pos3Team, group.result.pos4Team] as [string,string,string,string]
                  : null;
                const hasScore = group.groupScore !== null && group.groupScore !== undefined;

                return (
                  <div
                    key={group.name}
                    className={cn(
                      "rounded-xl border p-3 bg-card",
                      order ? "border-border/50" : "border-border/30 opacity-60",
                    )}
                  >
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bebas text-lg tracking-wider text-foreground flex items-center gap-1.5">
                        <span className="text-yellow-400/70 text-sm">GROUP</span>
                        {group.name}
                      </p>
                      {hasScore && (
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full border",
                          group.groupScore === 12
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : group.groupScore! > 0
                              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                              : "bg-muted/40 text-muted-foreground border-border/40",
                        )}>
                          {group.groupScore}/12 pts
                        </span>
                      )}
                    </div>

                    {order ? (
                      <div className="flex flex-col gap-1.5">
                        {order.map((teamName, idx) => {
                          const team = teamByName.get(teamName);
                          const pos = POSITION_STYLES[idx];
                          const pts = actual ? getPositionScore(actual, order, idx) : null;

                          const rowBg =
                            pts === 3 ? "bg-emerald-500/8 border-emerald-500/25"
                            : pts === 1 ? "bg-amber-500/8 border-amber-500/25"
                            : pts === 0 ? "bg-background/50 border-border/15"
                            : "bg-background/50 border-border/20";

                          return (
                            <div
                              key={teamName}
                              className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 border", rowBg)}
                            >
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 w-9 text-center shrink-0",
                                pos.bg,
                              )}>
                                {pos.label}
                              </span>
                              {team?.flagUrl ? (
                                <img
                                  src={team.flagUrl}
                                  alt={teamName}
                                  className="w-6 h-4 object-cover rounded-sm shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="w-6 h-4 rounded-sm bg-muted/50 flex items-center justify-center shrink-0">
                                  <span className="text-[8px] text-muted-foreground font-bold">
                                    {team?.abbr?.slice(0, 2)}
                                  </span>
                                </div>
                              )}
                              <span className="flex-1 text-sm font-medium text-foreground truncate">
                                {team?.name ?? teamName}
                              </span>
                              {pts !== null && (
                                <span className={cn(
                                  "flex items-center gap-0.5 shrink-0 text-[10px] font-bold",
                                  pts === 3 ? "text-emerald-400" : pts === 1 ? "text-amber-400" : "text-muted-foreground/50",
                                )}>
                                  {pts === 3 ? <Check className="w-3 h-3" /> : pts === 1 ? <Minus className="w-3 h-3" /> : <X className="w-3 h-3" />}
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
  const { data: leaderboard, isLoading } = useGetGspLeaderboard(poolId, {
    query: { queryKey: getGetGspLeaderboardQueryKey(poolId), refetchInterval: 60_000 },
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

  const groupsScored = leaderboard[0]?.groupScores.filter((g) => g.hasResult).length ?? 0;

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
        {/* Scoring status bar */}
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Medal className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium">Group Results Entered</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-bebas text-xl tracking-wider",
              groupsScored === 12 ? "text-yellow-400" : "text-foreground",
            )}>
              {groupsScored}
            </span>
            <span className="text-muted-foreground font-bebas text-xl">/12</span>
            {groupsScored === 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                Leaderboard updates as results are entered
              </span>
            )}
          </div>
        </div>

        {/* Hint */}
        <p className="text-sm text-muted-foreground text-center">
          Click on a player's name to view their predictions!
        </p>

        {/* Player rows */}
        <div className="space-y-2">
          {leaderboard.map((entry) => {
            const isMe = entry.userId === user?.id;
            const rankStyle = RANK_STYLES[entry.rank - 1];
            const pct = groupsScored > 0 ? (entry.totalScore / (groupsScored * 12)) * 100 : 0;
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
                  {/* Rank badge */}
                  <div className={cn(
                    "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 font-bebas text-lg",
                    rankStyle
                      ? rankStyle.bg
                      : "bg-muted/30 border-border/40 text-muted-foreground",
                  )}>
                    {rankStyle ? rankStyle.icon : `#${entry.rank}`}
                  </div>

                  {/* Name — clickable */}
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
                    {/* Mini score bar */}
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

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <p className="font-bebas text-2xl tracking-wider leading-none">
                      <span className={entry.totalScore > 0 ? "text-foreground" : "text-muted-foreground"}>
                        {entry.totalScore}
                      </span>
                      <span className="text-muted-foreground text-base"> / 144</span>
                    </p>
                    {groupsScored > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {groupsScored} group{groupsScored !== 1 ? "s" : ""} scored
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

        {groupsScored === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Scores will appear here once the pool commissioner enters actual group stage results.
          </p>
        )}
      </div>
    </>
  );
}

// ── Commissioner tab ──────────────────────────────────────────────────────────

function CommissionerTab({ poolId, inviteCode }: { poolId: number; inviteCode: string }) {
  const { toast } = useToast();

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
      <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">
              Invite Code
            </h4>
            <p className="text-sm text-muted-foreground">
              Share this code to let players join the pool.
            </p>
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
      <CancelPoolButton poolId={poolId} />
    </div>
  );
}

// ── My Picks tab ─────────────────────────────────────────────────────────────

function MyPicksTab({ poolId }: { poolId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups, isLoading } = useGetGspGroups(poolId);
  const submitPicks = useSubmitGspPicks();

  const [orders, setOrders] = useState<Record<string, TeamOrder>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  // savedOrders mirrors what is currently persisted in the DB
  const [savedOrders, setSavedOrders] = useState<Record<string, TeamOrder>>({});
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (!groups || initialised) return;
    const newOrders: Record<string, TeamOrder> = {};
    const newSaved: Record<string, TeamOrder> = {};
    const newConfirmed = new Set<string>();
    for (const group of groups) {
      if (group.myPick) {
        const savedOrder: TeamOrder = [
          group.myPick.pos1Team,
          group.myPick.pos2Team,
          group.myPick.pos3Team,
          group.myPick.pos4Team,
        ];
        newOrders[group.name] = savedOrder;
        newSaved[group.name] = savedOrder;
        newConfirmed.add(group.name);
      } else {
        newOrders[group.name] = group.teams.map((t) => t.name) as TeamOrder;
      }
    }
    setOrders(newOrders);
    setSavedOrders(newSaved);
    setConfirmed(newConfirmed);
    setInitialised(true);
  }, [groups, initialised]);

  function moveTeam(groupName: string, fromIdx: number, toIdx: number) {
    setOrders((prev) => {
      const order = [...(prev[groupName] ?? [])] as TeamOrder;
      const [moved] = order.splice(fromIdx, 1);
      order.splice(toIdx, 0, moved);
      return { ...prev, [groupName]: order as TeamOrder };
    });
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(groupName);
      return next;
    });
  }

  function confirmGroup(groupName: string) {
    setConfirmed((prev) => new Set([...prev, groupName]));
  }

  // Tournament kicked off June 11 2026 — picks locked from that point on
  const picksLocked = new Date() >= new Date("2026-06-11T12:00:00Z");

  const confirmedCount = confirmed.size;
  const totalGroups = groups?.length ?? 12;
  const allConfirmed = confirmedCount === totalGroups;

  // Show the submit bar only when all groups are confirmed AND at least one
  // confirmed group's current order differs from what's saved in the DB.
  const hasPendingChanges = allConfirmed && Array.from(confirmed).some((g) => {
    const saved = savedOrders[g];
    const current = orders[g];
    if (!saved) return true; // group has never been submitted
    if (!current) return false;
    return current.some((t, i) => t !== saved[i]);
  });

  async function handleSubmit() {
    if (!allConfirmed) return;
    const picks = Object.entries(orders).map(([groupName, order]) => ({
      groupName,
      pos1Team: order[0],
      pos2Team: order[1],
      pos3Team: order[2],
      pos4Team: order[3],
    }));
    submitPicks.mutate(
      { poolId, data: { picks } },
      {
        onSuccess: () => {
          toast({ title: "Picks locked in! 🏆", description: "All 12 group predictions have been saved." });
          // Mark current orders as saved so the bar hides
          setSavedOrders({ ...orders });
          queryClient.invalidateQueries({ queryKey: ["getGspGroups", poolId] });
        },
        onError: () => {
          toast({ title: "Submission failed", description: "Something went wrong. Please try again.", variant: "destructive" });
        },
      },
    );
  }

  if (isLoading || !groups) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Progress bar / locked banner */}
      {picksLocked ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <span className="text-lg leading-none">🔒</span>
          <div>
            <p className="font-semibold text-sm text-amber-200 leading-snug">Picks Locked — Tournament has begun</p>
            <p className="text-xs text-muted-foreground mt-0.5">The 2026 World Cup kicked off on June 11. All predictions are now final.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-card border border-border/50 rounded-full px-4 py-2 shadow-sm">
            <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="font-bebas text-xl tracking-wider">
              <span className={cn(allConfirmed ? "text-yellow-400" : "text-foreground")}>{confirmedCount}</span>
              <span className="text-muted-foreground">/{totalGroups}</span>
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider hidden sm:block">groups predicted</span>
          </div>
          <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", allConfirmed ? "bg-yellow-400" : "bg-primary")}
              style={{ width: `${(confirmedCount / totalGroups) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Group cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((group) => {
          const isConfirmed = confirmed.has(group.name);
          const order = orders[group.name] ?? (group.teams.map((t) => t.name) as TeamOrder);
          const teamByName = new Map(group.teams.map((t) => [t.name, t]));
          const actual = group.result
            ? [group.result.pos1Team, group.result.pos2Team, group.result.pos3Team, group.result.pos4Team] as [string,string,string,string]
            : null;
          const hasGroupScore = picksLocked && group.groupScore !== null && group.groupScore !== undefined;

          return (
            <div
              key={group.name}
              className={cn(
                "rounded-xl border-2 p-4 transition-all duration-200 flex flex-col gap-3",
                isConfirmed || picksLocked
                  ? "border-yellow-500/50 bg-yellow-500/5 shadow-[0_0_20px_rgba(234,179,8,0.06)]"
                  : "border-border/50 bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bebas text-2xl tracking-wider text-foreground">Group {group.name}</span>
                  {isConfirmed && <CheckCircle2 className="w-4 h-4 text-yellow-400 shrink-0" />}
                </div>
                {hasGroupScore ? (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full border",
                    group.groupScore === 12
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : group.groupScore! > 0
                        ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                        : "bg-muted/40 text-muted-foreground border-border/40",
                  )}>
                    {group.groupScore}/12 pts
                  </span>
                ) : !isConfirmed && !picksLocked ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">
                    Unranked
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                {order.map((teamName, idx) => {
                  const team = teamByName.get(teamName);
                  const pos = POSITION_STYLES[idx];
                  const isFirst = idx === 0;
                  const isLast = idx === order.length - 1;
                  const pts = actual ? getPositionScore(actual, order, idx) : null;

                  const rowClass = picksLocked && pts !== null
                    ? pts === 3 ? "bg-emerald-500/8 border-emerald-500/25"
                      : pts === 1 ? "bg-amber-500/8 border-amber-500/25"
                      : "bg-background/50 border-border/15"
                    : isConfirmed
                      ? "bg-background/50 border-border/30"
                      : "bg-background/30 border-border/20 hover:border-border/50";

                  return (
                    <div
                      key={teamName}
                      className={cn("flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors", rowClass)}
                    >
                      <span className={cn("text-[11px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 w-10 text-center shrink-0", pos.bg)}>
                        {pos.label}
                      </span>
                      {team?.flagUrl ? (
                        <img
                          src={team.flagUrl}
                          alt={team.name}
                          className="w-7 h-5 object-cover rounded-sm shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-7 h-5 rounded-sm bg-muted/50 flex items-center justify-center shrink-0">
                          <span className="text-[9px] text-muted-foreground font-bold">{team?.abbr?.slice(0, 2)}</span>
                        </div>
                      )}
                      <span className="flex-1 text-sm font-medium text-foreground truncate">{team?.name ?? teamName}</span>
                      {picksLocked && pts !== null && (
                        <span className={cn(
                          "flex items-center gap-0.5 shrink-0 text-[10px] font-bold",
                          pts === 3 ? "text-emerald-400" : pts === 1 ? "text-amber-400" : "text-muted-foreground/50",
                        )}>
                          {pts === 3 ? <Check className="w-3 h-3" /> : pts === 1 ? <Minus className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {pts}
                        </span>
                      )}
                      {!isConfirmed && !picksLocked && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => moveTeam(group.name, idx, idx - 1)}
                            className={cn(
                              "w-6 h-5 flex items-center justify-center rounded transition-colors",
                              isFirst ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => moveTeam(group.name, idx, idx + 1)}
                            className={cn(
                              "w-6 h-5 flex items-center justify-center rounded transition-colors",
                              isLast ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                          >
                            <ChevronDown className="w-4 h-4" />
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
                      onClick={() => setConfirmed((prev) => { const n = new Set(prev); n.delete(group.name); return n; })}
                      className="w-full text-xs text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 rounded-lg py-1.5 transition-colors"
                    >
                      Edit ranking
                    </button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => confirmGroup(group.name)}
                      className="w-full bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:border-yellow-500/60"
                      variant="outline"
                    >
                      <Circle className="w-3.5 h-3.5 mr-1.5" />
                      Confirm Group {group.name}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky submit bar — only visible when there are unsaved changes and picks not locked */}
      {!picksLocked && hasPendingChanges && (
        <div className="sticky bottom-4 flex justify-center pt-2">
          <div className="flex flex-col sm:flex-row items-center gap-3 rounded-2xl border px-6 py-4 shadow-xl backdrop-blur-sm bg-yellow-500/10 border-yellow-500/40 shadow-yellow-500/10">
            <div className="text-center sm:text-left">
              <p className="font-bebas text-xl tracking-wider text-yellow-300">
                All groups predicted!
              </p>
              <p className="text-xs text-muted-foreground">
                Lock in your picks for all 12 WC groups
              </p>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitPicks.isPending}
              className="gap-2 font-bebas text-xl tracking-wider px-8 py-5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg shadow-yellow-500/20"
            >
              <Send className="w-5 h-5" />
              {submitPicks.isPending ? "Saving..." : "Submit All Picks"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live Standings tab ────────────────────────────────────────────────────────

const QUAL_BG: Record<number, string> = {
  1: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  2: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  3: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  4: "bg-transparent text-muted-foreground border-border/30",
};

function LiveStandingsTab({ poolId }: { poolId: number }) {
  const { data: groups, isLoading, isFetching, refetch, dataUpdatedAt } = useGetGspLiveStandings(
    poolId,
    { query: { queryKey: ["gsp-live-standings", poolId], refetchInterval: 60_000, staleTime: 55_000 } },
  );

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const pretournament = groups?.every((g) => g.teams.every((t) => t.played === 0));

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!groups?.length) {
    return (
      <div className="mt-10 text-center text-muted-foreground text-sm">
        Standings unavailable — ESPN API may be unreachable. Try again shortly.
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Header bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          <span>Live data from ESPN · auto-refreshes every 60 s</span>
          {pretournament && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 text-[10px] font-semibold tracking-wide uppercase">
              Pre-tournament
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 hover:border-border/70 hover:bg-muted/30 transition-colors",
            isFetching && "opacity-60 pointer-events-none",
          )}
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          {updatedLabel ? `Updated ${updatedLabel}` : "Refresh"}
        </button>
      </div>

      {/* Group cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <Card key={group.groupLetter} className="bg-card border-border/50 overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="font-bebas text-xl tracking-wider text-foreground">
                {group.displayName}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-3">
              {/* Column headers */}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-2 px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 border-b border-border/20">
                <span className="w-5 text-center">#</span>
                <span>Team</span>
                <span className="w-6 text-center">MP</span>
                <span className="w-7 text-center">GD</span>
                <span className="w-7 text-center font-bold text-muted-foreground/70">Pts</span>
              </div>
              {/* Team rows */}
              {group.teams.map((team, idx) => {
                const pos = idx + 1;
                const advances = pos <= 2;
                const gdStr = team.gd > 0 ? `+${team.gd}` : String(team.gd);
                return (
                  <div
                    key={team.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-2 px-4 py-1.5",
                      idx < group.teams.length - 1 && "border-b border-border/10",
                    )}
                  >
                    {/* Position badge */}
                    <span
                      className={cn(
                        "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 border",
                        QUAL_BG[pos] ?? QUAL_BG[4],
                      )}
                    >
                      {pos}
                    </span>
                    {/* Flag + name */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {team.logo ? (
                        <img
                          src={team.logo}
                          alt={team.abbreviation}
                          className="w-5 h-4 object-cover rounded-[2px] shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="w-5 h-4 rounded-[2px] bg-muted/50 flex items-center justify-center text-[8px] text-muted-foreground font-bold shrink-0">
                          {team.abbreviation.slice(0, 2)}
                        </span>
                      )}
                      <span className={cn("text-sm truncate", advances ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {team.displayName}
                      </span>
                    </div>
                    {/* MP */}
                    <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">
                      {team.played}
                    </span>
                    {/* GD */}
                    <span className={cn(
                      "w-7 text-center text-xs tabular-nums",
                      team.gd > 0 ? "text-emerald-400" : team.gd < 0 ? "text-red-400" : "text-muted-foreground",
                    )}>
                      {team.played > 0 ? gdStr : "—"}
                    </span>
                    {/* Points */}
                    <span className={cn(
                      "w-7 text-center text-sm font-bold tabular-nums",
                      advances ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {team.played > 0 ? team.points : "—"}
                    </span>
                  </div>
                );
              })}
              {/* Qualification key */}
              <div className="flex items-center gap-3 px-4 pt-2 mt-1 border-t border-border/10">
                <div className="flex items-center gap-1 text-[10px] text-emerald-400/70">
                  <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
                  Advance
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export function GroupStagePredictorView({ poolId, isCommissioner, inviteCode }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-bebas text-3xl tracking-wider text-foreground flex items-center gap-2">
          <ListOrdered className="w-7 h-7 text-yellow-400" />
          Group Stage Predictor
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pick the final standings for all 12 World Cup groups. 3 pts for exact position, 1 pt if the team advances but wrong spot. Max 144 pts — highest score wins the pot. Lock in your picks before June 11 kickoff!
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
            <TabsTrigger value="standings" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2">
              <Globe className="w-4 h-4" /> Live Standings
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

        <TabsContent value="standings">
          <LiveStandingsTab poolId={poolId} />
        </TabsContent>

        {isCommissioner && inviteCode && (
          <TabsContent value="commissioner">
            <CommissionerTab poolId={poolId} inviteCode={inviteCode} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
