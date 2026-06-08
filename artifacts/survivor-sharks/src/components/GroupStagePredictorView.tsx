import { useState, useEffect } from "react";
import { useGetGspGroups, useSubmitGspPicks } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, CheckCircle2, Circle, ListOrdered, Send, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  poolId: number;
}

type TeamOrder = [string, string, string, string];

const POSITION_STYLES = [
  { label: "1st", bg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", dot: "bg-yellow-400" },
  { label: "2nd", bg: "bg-slate-400/20 text-slate-300 border-slate-400/40",   dot: "bg-slate-400" },
  { label: "3rd", bg: "bg-orange-600/20 text-orange-400 border-orange-600/40", dot: "bg-orange-500" },
  { label: "4th", bg: "bg-muted/40 text-muted-foreground border-border/40",   dot: "bg-muted-foreground/40" },
];

export function GroupStagePredictorView({ poolId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups, isLoading } = useGetGspGroups(poolId);
  const submitPicks = useSubmitGspPicks();

  // Local pick state: groupName -> ordered team names
  const [orders, setOrders] = useState<Record<string, TeamOrder>>({});
  // Which groups the user has explicitly confirmed
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  // Track whether we've initialised from server data
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (!groups || initialised) return;
    const newOrders: Record<string, TeamOrder> = {};
    const newConfirmed = new Set<string>();
    for (const group of groups) {
      if (group.myPick) {
        newOrders[group.name] = [
          group.myPick.pos1Team,
          group.myPick.pos2Team,
          group.myPick.pos3Team,
          group.myPick.pos4Team,
        ];
        newConfirmed.add(group.name);
      } else {
        newOrders[group.name] = group.teams.map((t) => t.name) as TeamOrder;
      }
    }
    setOrders(newOrders);
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
    // Unconfirm the group when user changes the order
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(groupName);
      return next;
    });
  }

  function confirmGroup(groupName: string) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.add(groupName);
      return next;
    });
  }

  const confirmedCount = confirmed.size;
  const totalGroups = groups?.length ?? 12;
  const allConfirmed = confirmedCount === totalGroups;

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header / Progress ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-bebas text-3xl tracking-wider text-foreground flex items-center gap-2">
            <ListOrdered className="w-7 h-7 text-yellow-400" />
            Group Stage Predictor
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rank all 4 teams in each group from 1st to 4th, then confirm and submit.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress pill */}
          <div className="flex items-center gap-2 bg-card border border-border/50 rounded-full px-4 py-2 shadow-sm">
            <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="font-bebas text-xl tracking-wider">
              <span className={cn(allConfirmed ? "text-yellow-400" : "text-foreground")}>
                {confirmedCount}
              </span>
              <span className="text-muted-foreground">/{totalGroups}</span>
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider hidden sm:block">
              groups predicted
            </span>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            allConfirmed ? "bg-yellow-400" : "bg-primary",
          )}
          style={{ width: `${(confirmedCount / totalGroups) * 100}%` }}
        />
      </div>

      {/* ── Group Cards Grid ── */}
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
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bebas text-2xl tracking-wider text-foreground">
                    Group {group.name}
                  </span>
                  {isConfirmed && (
                    <CheckCircle2 className="w-4 h-4 text-yellow-400 shrink-0" />
                  )}
                </div>
                {!isConfirmed && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">
                    Unranked
                  </span>
                )}
              </div>

              {/* Team rows */}
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
                      {/* Position badge */}
                      <span className={cn(
                        "text-[11px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 w-10 text-center shrink-0",
                        pos.bg,
                      )}>
                        {pos.label}
                      </span>

                      {/* Flag */}
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

                      {/* Team name */}
                      <span className="flex-1 text-sm font-medium text-foreground truncate">
                        {team?.name ?? teamName}
                      </span>

                      {/* Move buttons */}
                      {!isConfirmed && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => moveTeam(group.name, idx, idx - 1)}
                            className={cn(
                              "w-6 h-5 flex items-center justify-center rounded transition-colors",
                              isFirst
                                ? "text-muted-foreground/20 cursor-not-allowed"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
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
                              isLast
                                ? "text-muted-foreground/20 cursor-not-allowed"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
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

              {/* Confirm / Edit button */}
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

      {/* ── Submit All Picks ── */}
      <div className="sticky bottom-4 flex justify-center pt-2">
        <div className={cn(
          "flex flex-col sm:flex-row items-center gap-3 rounded-2xl border px-6 py-4 shadow-xl backdrop-blur-sm transition-all",
          allConfirmed
            ? "bg-yellow-500/10 border-yellow-500/40 shadow-yellow-500/10"
            : "bg-card/90 border-border/50",
        )}>
          <div className="text-center sm:text-left">
            <p className={cn("font-bebas text-xl tracking-wider", allConfirmed ? "text-yellow-300" : "text-muted-foreground")}>
              {allConfirmed ? "All groups predicted!" : `${totalGroups - confirmedCount} group${totalGroups - confirmedCount !== 1 ? "s" : ""} left`}
            </p>
            <p className="text-xs text-muted-foreground">
              {allConfirmed
                ? "Lock in your picks for all 12 WC groups"
                : "Rank and confirm every group to unlock submission"}
            </p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!allConfirmed || submitPicks.isPending}
            className={cn(
              "gap-2 font-bebas text-xl tracking-wider px-8 py-5 rounded-xl transition-all",
              allConfirmed
                ? "bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg shadow-yellow-500/20"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <Send className="w-5 h-5" />
            {submitPicks.isPending ? "Saving..." : "Submit All Picks"}
          </Button>
        </div>
      </div>
    </div>
  );
}
