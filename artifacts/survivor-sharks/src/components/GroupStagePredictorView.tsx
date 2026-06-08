import { useState, useEffect } from "react";
import {
  useGetGspGroups,
  useSubmitGspPicks,
  useGetGspLeaderboard,
  getGetGspLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

// ── Leaderboard tab ──────────────────────────────────────────────────────────

function LeaderboardTab({ poolId }: { poolId: number }) {
  const { user } = useAuth();
  const { data: leaderboard, isLoading } = useGetGspLeaderboard(poolId, {
    query: { queryKey: getGetGspLeaderboardQueryKey(poolId), refetchInterval: 60_000 },
  });

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

      {/* Player rows */}
      <div className="space-y-2">
        {leaderboard.map((entry) => {
          const isMe = entry.userId === user?.id;
          const rankStyle = RANK_STYLES[entry.rank - 1];
          const pct = groupsScored > 0 ? (entry.totalScore / (groupsScored * 12)) * 100 : 0;

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

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium truncate", isMe && "text-primary")}>
                    {entry.displayName ?? entry.username}
                    {isMe && <span className="ml-1.5 text-xs text-primary/60 font-normal">(you)</span>}
                  </p>
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
                </div>

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
  );
}

// ── Commissioner tab ──────────────────────────────────────────────────────────

function CommissionerTab({ inviteCode }: { inviteCode: string }) {
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
      <Card className="bg-card border-border/50 overflow-hidden relative">
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.1),transparent)] pointer-events-none" />
        <CardHeader>
          <CardTitle className="font-bebas text-3xl tracking-wide text-primary">Invite Code</CardTitle>
          <CardDescription>Share this code or link to let sharks into the pool.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
              {inviteCode}
            </div>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={copyInvite} className="font-bebas text-xl tracking-wider">
                <Copy className="w-5 h-5 mr-2" /> Copy Code
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink} className="font-bebas tracking-wider text-sm">
                <Copy className="w-4 h-4 mr-2" /> Copy Invite Link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
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
      {/* Progress bar */}
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

      {/* Group cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((group) => {
          const isConfirmed = confirmed.has(group.name);
          const order = orders[group.name] ?? (group.teams.map((t) => t.name) as TeamOrder);
          const teamByName = new Map(group.teams.map((t) => [t.name, t]));

          return (
            <div
              key={group.name}
              className={cn(
                "rounded-xl border-2 p-4 transition-all duration-200 flex flex-col gap-3",
                isConfirmed
                  ? "border-yellow-500/50 bg-yellow-500/5 shadow-[0_0_20px_rgba(234,179,8,0.06)]"
                  : "border-border/50 bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bebas text-2xl tracking-wider text-foreground">Group {group.name}</span>
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

                  return (
                    <div
                      key={teamName}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors",
                        isConfirmed
                          ? "bg-background/50 border-border/30"
                          : "bg-background/30 border-border/20 hover:border-border/50",
                      )}
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
                      {!isConfirmed && (
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
            </div>
          );
        })}
      </div>

      {/* Sticky submit bar — only visible when there are unsaved changes */}
      {hasPendingChanges && (
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
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="picks" className="font-bebas text-lg tracking-wider px-5 py-2.5 gap-2">
            <ListOrdered className="w-4 h-4" /> My Picks
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="font-bebas text-lg tracking-wider px-5 py-2.5 gap-2">
            <Trophy className="w-4 h-4" /> Leaderboard
          </TabsTrigger>
          {isCommissioner && (
            <TabsTrigger value="commissioner" className="font-bebas text-lg tracking-wider px-5 py-2.5 gap-2 text-muted-foreground hover:text-foreground ml-auto">
              <ShieldAlert className="w-4 h-4" /> Commissioner
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="picks">
          <MyPicksTab poolId={poolId} />
        </TabsContent>

        <TabsContent value="leaderboard">
          <LeaderboardTab poolId={poolId} />
        </TabsContent>

        {isCommissioner && inviteCode && (
          <TabsContent value="commissioner">
            <CommissionerTab inviteCode={inviteCode} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
