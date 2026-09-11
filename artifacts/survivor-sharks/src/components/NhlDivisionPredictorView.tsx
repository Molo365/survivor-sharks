import { useState, useEffect } from "react";
import { invalidatePoolQueries } from "@/lib/queryUtils";
import {
  useGetNhlNdpDivisions,
  getGetNhlNdpDivisionsQueryKey,
  useSubmitNhlNdpPicks,
  useGetNhlNdpLeaderboard,
  getGetNhlNdpLeaderboardQueryKey,
  useGetNhlNdpMemberPicks,
  getGetNhlNdpMemberPicksQueryKey,
  getGetPoolQueryKey,
  useGetNhlNdpMyTiebreaker,
  getGetNhlNdpMyTiebreakerQueryKey,
  getGetPickEmDashboardStatsQueryKey,
  useGetNhlNdpLiveStandings,
  useGetNhlNdpLockState,
  getGetNhlNdpLockStateQueryKey,
  ApiError,
  NhlNdpPickDivisionName,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CancelPoolButton } from "@/components/CancelPoolButton";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
  Globe,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Lock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NhlNdpPick, NhlNdpDivisionResult, NhlNdpResultsResponse } from "@workspace/api-client-react";
import { useGetNhlNdpResults, useSubmitNhlNdpResults, getGetNhlNdpResultsQueryKey, getGetNhlNdpLiveStandingsQueryKey } from "@workspace/api-client-react";

import { BroadcastEmailDialog } from "@/components/BroadcastEmailDialog";

interface Props {
  poolId: number;
  isCommissioner?: boolean;
  inviteCode?: string | null;
  sandboxMode?: boolean;
  isSuperAdmin?: boolean;
}

type TeamOrder = [string, string, string, string, string, string, string, string];

type PickGrade = "correct" | "partial" | "wrong";

function getPickGrade(teamName: string, idx: number, actual: TeamOrder): PickGrade {
  const actualIdx = actual.indexOf(teamName);
  if (actualIdx === idx) return "correct";
  if (actualIdx !== -1 && Math.abs(actualIdx - idx) === 1) return "partial";
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
  { label: "5th", bg: "bg-muted/40 text-muted-foreground border-border/40" },
  { label: "6th", bg: "bg-muted/40 text-muted-foreground border-border/40" },
  { label: "7th", bg: "bg-muted/40 text-muted-foreground border-border/40" },
  { label: "8th", bg: "bg-muted/40 text-muted-foreground border-border/40" },
];

const RANK_STYLES = [
  { icon: Trophy, iconColor: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300" },
  { icon: Medal, iconColor: "text-slate-300", bg: "bg-slate-400/10 border-slate-400/30 text-slate-300" },
  { icon: Medal, iconColor: "text-orange-400", bg: "bg-orange-600/10 border-orange-600/30 text-orange-400" },
];

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
  const { data: divisions, isLoading: isDivisionsLoading } = useGetNhlNdpDivisions(poolId, {
    query: { queryKey: getGetNhlNdpDivisionsQueryKey(poolId) },
  });
  const { data: userPicks, isLoading: isPicksLoading } = useGetNhlNdpMemberPicks(poolId, userId, {
    query: { queryKey: getGetNhlNdpMemberPicksQueryKey(poolId, userId) },
  });

  const isLoading = isDivisionsLoading || isPicksLoading;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-background border-border/60 p-0">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : !divisions || divisions.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No predictions found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {divisions.map((div) => {
                const teamByName = new Map(div.teams.map((t) => [t.name, t]));
                const userPick = userPicks?.find(p => p.divisionName === div.name);
                const order = userPick
                  ? [
                      userPick.pos1Team, userPick.pos2Team, userPick.pos3Team, userPick.pos4Team,
                      userPick.pos5Team, userPick.pos6Team, userPick.pos7Team, userPick.pos8Team,
                    ] as TeamOrder
                  : null;
                const actual = div.actualResult
                  ? [
                      div.actualResult.pos1Team, div.actualResult.pos2Team, div.actualResult.pos3Team, div.actualResult.pos4Team,
                      div.actualResult.pos5Team, div.actualResult.pos6Team, div.actualResult.pos7Team, div.actualResult.pos8Team,
                    ] as TeamOrder
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
  const { data: leaderboard, isLoading } = useGetNhlNdpLeaderboard(poolId, {
    query: { queryKey: getGetNhlNdpLeaderboardQueryKey(poolId), refetchInterval: 60_000 },
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

  if (!leaderboard || leaderboard.entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Trophy className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground">No members in this pool yet.</p>
      </div>
    );
  }

  const entries = leaderboard.entries;
  const divisionsScored = entries[0]?.divisionScores.filter((d) => d.hasResult).length ?? 0;

  const tiedScore = entries.find((entry) =>
    entries.filter((candidate) => candidate.totalScore === entry.totalScore).length > 1
  )?.totalScore;
  const tiedPlayers = tiedScore === undefined
    ? []
    : entries.filter((entry) => entry.totalScore === tiedScore && entry.tbGuess !== null);

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
        {tiedPlayers.length > 1 && leaderboard.tbActual !== null && (
          <Card className="border-yellow-500/30 bg-yellow-500/5" data-testid="card-atlantic-tiebreaker">
            <CardHeader className="pb-2">
              <CardTitle className="font-bebas text-xl tracking-wider text-yellow-400">
                Atlantic Points Tiebreaker
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Actual combined points: <strong className="text-foreground">{leaderboard.tbActual}</strong>
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {tiedPlayers.map((entry) => (
                <div key={entry.userId} className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3 py-2">
                  <span className="text-sm font-medium">{entry.displayName || entry.username}</span>
                  <span className="text-xs text-muted-foreground">
                    Guess <strong className="text-foreground">{entry.tbGuess}</strong>
                    {" · "}
                    Difference <strong className="text-yellow-400">{entry.tiebreakerDiff}</strong>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Medal className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium">Division Results Entered</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-bebas text-xl tracking-wider",
              divisionsScored === 4 ? "text-yellow-400" : "text-foreground",
            )}>
              {divisionsScored}
            </span>
            <span className="text-muted-foreground font-bebas text-xl">/4</span>
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
          {entries.map((entry) => {
            const isMe = entry.userId === user?.id;
            const rankStyle = RANK_STYLES[entry.rank - 1];
            const pct = divisionsScored > 0 ? (entry.totalScore / (divisionsScored * 24)) * 100 : 0;
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
                    {rankStyle ? <rankStyle.icon className={cn("w-5 h-5", rankStyle.iconColor)} /> : `#${entry.rank}`}
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
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {entry.divisionScores.map((division) => (
                        <span
                          key={division.divisionName}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                            division.hasResult
                              ? "border-border/40 bg-muted/30 text-foreground"
                              : "border-border/20 text-muted-foreground/60",
                          )}
                          data-testid={`text-division-score-${entry.userId}-${division.divisionName}`}
                        >
                          {division.divisionName.slice(0, 3).toUpperCase()} {division.score}/24
                        </span>
                      ))}
                    </div>
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
                    {entry.prizeAmount != null && entry.prizeAmount > 0 && (
                      <p className="text-xs font-semibold text-green-400 mt-1" data-testid={`text-prize-${entry.userId}`}>
                        Prize ${entry.prizeAmount.toFixed(2)}
                      </p>
                    )}
                    {divisionsScored > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {divisionsScored} division{divisionsScored !== 1 ? "s" : ""} scored
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

// ── Live Standings tab ────────────────────────────────────────────────────────

function seedZone(seed: number): "div" | "wild" | "out" {
  if (seed <= 3) return "div";
  if (seed <= 5) return "wild"; // Note: this is a loose approximation for NHL wildcard seeds
  return "out";
}

const ZONE_BADGE: Record<string, string> = {
  div:  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  wild: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  out:  "bg-transparent text-muted-foreground border-border/30",
};

function LiveStandingsTab({ poolId }: { poolId: number }) {
  const {
    data: groups,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useGetNhlNdpLiveStandings(poolId, {
    query: { queryKey: getGetNhlNdpLiveStandingsQueryKey(poolId), refetchInterval: 60_000, staleTime: 55_000 },
  });

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const preseason = groups?.every(g => g.teams.every(t => t.wins === 0 && t.losses === 0 && t.otLosses === 0));

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[400px] rounded-xl" />
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
          {preseason && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 text-[10px] font-semibold tracking-wide uppercase">
              Pre-season
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

      {/* Legend */}
      {!preseason && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border bg-emerald-500/20 border-emerald-500/30 inline-block" />
            Top 3 in Division
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border bg-blue-500/10 border-blue-500/20 inline-block" />
            Wild card contenders
          </span>
        </div>
      )}

      {/* 4-division card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map(group => (
          <Card key={group.divisionName} className="bg-card border-border/50 overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="font-bebas text-lg tracking-wider text-foreground leading-none">
                {group.divisionName}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-3">
              {/* Column headers */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 border-b border-border/20">
                <span className="w-5 text-center">#</span>
                <span>Team</span>
                <span className="w-16 text-center">W-L-OTL</span>
                <span className="w-8 text-center">PTS</span>
              </div>

              {/* Team rows */}
              {group.teams.map((team, idx) => {
                const zone = seedZone(idx + 1); // We don't have playoffSeed, but they are sorted by rank.
                const record = `${team.wins}-${team.losses}-${team.otLosses}`;

                return (
                  <div
                    key={team.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 px-4 py-2",
                      idx < group.teams.length - 1 && "border-b border-border/10",
                    )}
                  >
                    {/* Seed-zone badge (position within division) */}
                    <span
                      className={cn(
                        "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 border",
                        ZONE_BADGE[zone],
                      )}
                    >
                      {idx + 1}
                    </span>

                    {/* Logo + name */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {team.logo ? (
                        <img src={team.logo} alt={team.abbreviation} className="w-5 h-5 object-contain shrink-0" />
                      ) : (
                        <span className="w-5 h-5 shrink-0 rounded-full bg-muted/40" />
                      )}
                      <span className={cn(
                        "text-sm truncate",
                        zone === "div" ? "text-foreground font-medium" : "text-foreground/80",
                      )}>
                        {team.abbreviation}
                      </span>
                    </div>

                    {/* W-L-OTL record */}
                    <span className="text-xs text-muted-foreground tabular-nums w-16 text-center">
                      {preseason ? "—" : record}
                    </span>

                    {/* Points */}
                    <span className="text-xs font-bold text-foreground tabular-nums w-8 text-center">
                      {preseason ? "—" : team.points}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {preseason && (
        <p className="text-center text-xs text-muted-foreground/50 pt-2">
          Standings will update once the NHL regular season begins.
        </p>
      )}
    </div>
  );
}

// ── Commissioner tab ──────────────────────────────────────────────────────────

function CommissionerTab({ poolId, inviteCode, isSuperAdmin = false }: {
  poolId: number;
  inviteCode: string;
  isSuperAdmin?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: divisions } = useGetNhlNdpDivisions(poolId, {
    query: { queryKey: getGetNhlNdpDivisionsQueryKey(poolId) },
  });
  const { data: savedResults, isLoading: isResultsLoading } = useGetNhlNdpResults(poolId, {
    query: { queryKey: getGetNhlNdpResultsQueryKey(poolId) },
  });
  const { data: leaderboard } = useGetNhlNdpLeaderboard(poolId, {
    query: { queryKey: getGetNhlNdpLeaderboardQueryKey(poolId) },
  });

  const submitResults = useSubmitNhlNdpResults();

  const [localResults, setLocalResults] = useState<Record<string, string[]>>({});
  const [localTbActual, setLocalTbActual] = useState<string>("");

  useEffect(() => {
    if (divisions) {
      const initial: Record<string, string[]> = {};
      for (const div of divisions) {
        const saved = savedResults?.find((r: NhlNdpDivisionResult) => r.divisionName === div.name);
        if (saved) {
          initial[div.name] = [
            saved.pos1Team, saved.pos2Team, saved.pos3Team, saved.pos4Team,
            saved.pos5Team, saved.pos6Team, saved.pos7Team, saved.pos8Team,
          ];
        } else if (!localResults[div.name]) {
          initial[div.name] = div.teams.map((t) => t.name);
        } else {
          initial[div.name] = localResults[div.name];
        }
      }
      setLocalResults(initial);
    }
  }, [divisions, savedResults]);

  useEffect(() => {
    if (leaderboard?.tbActual != null) {
      setLocalTbActual(leaderboard.tbActual.toString());
    }
  }, [leaderboard?.tbActual]);

  const handleMove = (divName: string, idx: number, direction: "up" | "down") => {
    setLocalResults((prev) => {
      const arr = [...prev[divName]];
      if (direction === "up" && idx > 0) {
        [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
      } else if (direction === "down" && idx < arr.length - 1) {
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      }
      return { ...prev, [divName]: arr };
    });
  };

  const handleSaveDivision = (divName: string) => {
    const teams = localResults[divName];
    if (!teams) return;
    const payload: NhlNdpPick = {
      divisionName: divName as any,
      pos1Team: teams[0],
      pos2Team: teams[1],
      pos3Team: teams[2],
      pos4Team: teams[3],
      pos5Team: teams[4],
      pos6Team: teams[5],
      pos7Team: teams[6],
      pos8Team: teams[7],
    };

    submitResults.mutate(
      { poolId, data: { results: [payload] } },
      {
        onSuccess: (data: any) => {
          toast({
            title: "Division Results Saved",
            description: data.closedPool
              ? "Pool closed!"
              : data.closureWarning
              ? `Warning: ${data.closureWarning}`
              : `${divName} standings updated.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpResultsQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpDivisionsQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpLeaderboardQueryKey(poolId) });
          if (data.closedPool) {
            queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
            queryClient.invalidateQueries({ queryKey: getGetPickEmDashboardStatsQueryKey() });
          }
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Failed", description: err.message });
        },
      }
    );
  };

  const handleSaveTiebreaker = () => {
    const tbNum = parseInt(localTbActual, 10);
    if (isNaN(tbNum) || tbNum < 0) {
      toast({ variant: "destructive", title: "Invalid input", description: "Must be a valid positive number." });
      return;
    }
    
    submitResults.mutate(
      { poolId, data: { results: [], tbActual: tbNum } },
      {
        onSuccess: (data: any) => {
          toast({
            title: "Tiebreaker Saved",
            description: data.closedPool ? "Pool closed!" : "Tiebreaker actual updated.",
          });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpResultsQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpLeaderboardQueryKey(poolId) });
          if (data.closedPool) {
            queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
            queryClient.invalidateQueries({ queryKey: getGetPickEmDashboardStatsQueryKey() });
          }
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Failed", description: err.message });
        },
      }
    );
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
    <div className="pt-4 max-w-2xl space-y-6">
      <BroadcastEmailDialog poolId={poolId} sport="nhl" poolType="nhl_division_predictor" />

      {isSuperAdmin && (
        <div className="space-y-6" data-testid="admin-results-section">
          <div>
            <h4 className="font-bebas text-2xl tracking-wide text-foreground flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-yellow-400" /> Admin Final Results
            </h4>
            <p className="text-sm text-muted-foreground">
              Enter official division finishes and the Atlantic combined points tiebreaker. When all finishes and tiebreakers are entered, the pool will automatically close and declare winners.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {divisions?.map((div) => {
              const teams = localResults[div.name] ?? [];
              const isSaved = savedResults?.some((r: NhlNdpDivisionResult) => r.divisionName === div.name);
              return (
                <div key={div.name} className="rounded-xl border border-border/40 bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bebas text-lg tracking-wider">{div.name} Division</h5>
                    {isSaved && <span className="text-[10px] font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded-full">SAVED</span>}
                  </div>
                  <div className="space-y-1">
                    {teams.map((teamName, idx) => {
                      const team = div.teams.find((t) => t.name === teamName);
                      return (
                        <div key={teamName} className="flex items-center gap-2 bg-background/50 border border-border/20 rounded-md p-1.5" data-testid={`admin-rank-${div.name}-${idx}`}>
                          <span className="text-[10px] font-bold text-muted-foreground w-4 text-right shrink-0">{idx + 1}</span>
                          {team?.logoUrl ? (
                            <img src={team.logoUrl} alt={team.name} className="w-5 h-5 object-contain shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-sm bg-muted flex items-center justify-center shrink-0">
                              <span className="text-[8px] font-bold text-muted-foreground">{team?.abbr.slice(0, 3)}</span>
                            </div>
                          )}
                          <span className="text-xs font-medium truncate flex-1">{team?.name ?? teamName}</span>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              disabled={idx === 0 || submitResults.isPending}
                              onClick={() => handleMove(div.name, idx, "up")}
                              className="p-0.5 rounded bg-muted/50 hover:bg-muted text-muted-foreground disabled:opacity-30 transition-colors"
                              data-testid={`admin-move-up-${div.name}-${idx}`}
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              disabled={idx === teams.length - 1 || submitResults.isPending}
                              onClick={() => handleMove(div.name, idx, "down")}
                              className="p-0.5 rounded bg-muted/50 hover:bg-muted text-muted-foreground disabled:opacity-30 transition-colors"
                              data-testid={`admin-move-down-${div.name}-${idx}`}
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="w-full font-bold"
                    onClick={() => handleSaveDivision(div.name)}
                    disabled={submitResults.isPending}
                    data-testid={`admin-save-div-${div.name}`}
                  >
                    {submitResults.isPending ? "Saving..." : isSaved ? "Update Division" : "Save Division"}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-yellow-500/20 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,rgba(10,14,26,1)_100%)] p-4 space-y-3">
            <h5 className="font-bebas text-lg tracking-wider text-yellow-400">Tiebreaker Actual</h5>
            <p className="text-xs text-muted-foreground">
              Atlantic Division combined points across all 8 teams.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                placeholder="e.g. 745"
                value={localTbActual}
                onChange={(e) => setLocalTbActual(e.target.value)}
                className="w-32 h-9 text-sm"
                data-testid="admin-tb-actual-input"
              />
              <Button
                size="sm"
                variant="outline"
                className="font-bold border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
                onClick={handleSaveTiebreaker}
                disabled={submitResults.isPending}
                data-testid="admin-save-tb"
              >
                Save Tiebreaker
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">Invite Code</h4>
            <p className="text-sm text-muted-foreground">Share this code to let players join the pool.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold" data-testid="invite-code-display">
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
// ── My Picks tab ──────────────────────────────────────────────────────────────

function MyPicksTab({ poolId }: { poolId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: divisions, isLoading } = useGetNhlNdpDivisions(poolId, {
    query: { queryKey: getGetNhlNdpDivisionsQueryKey(poolId) },
  });
  const {
    data: lockState,
    isLoading: isLockStateLoading,
    isError: isLockStateError,
  } = useGetNhlNdpLockState(poolId, {
    query: { queryKey: getGetNhlNdpLockStateQueryKey(poolId) },
  });
  const submitPicks = useSubmitNhlNdpPicks();
  const { data: myTiebreaker } = useGetNhlNdpMyTiebreaker(poolId);

  const [orders, setOrders] = useState<Record<string, TeamOrder>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [savedOrders, setSavedOrders] = useState<Record<string, TeamOrder>>({});
  const [initialised, setInitialised] = useState(false);
  const [showTbDialog, setShowTbDialog] = useState(false);
  const [tbGuess, setTbGuess] = useState("");
  const [lockRejected, setLockRejected] = useState(false);

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
          div.myPick.pos5Team,
          div.myPick.pos6Team,
          div.myPick.pos7Team,
          div.myPick.pos8Team,
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

  useEffect(() => {
    if (lockState) setLockRejected(lockState.locked);
  }, [lockState]);

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

  const lockStateUnavailable = isLockStateLoading || isLockStateError || !lockState;
  const picksLocked = lockRejected || lockState?.locked === true;
  const canEditPicks = !lockStateUnavailable && !picksLocked;
  const confirmedCount = confirmed.size;
  const totalDivisions = divisions?.length ?? 4;
  const allConfirmed = confirmedCount === totalDivisions;

  const hasPendingChanges = allConfirmed && Array.from(confirmed).some((d) => {
    const saved = savedOrders[d];
    const current = orders[d];
    if (!saved) return true;
    if (!current) return false;
    return current.some((t, i) => t !== saved[i]);
  });

  // Tiebreaker: Atlantic points. Prompt fires on first-ever picks submission.
  const needsTb = canEditPicks && myTiebreaker?.tbGuess == null;

  useEffect(() => {
    if (picksLocked) setShowTbDialog(false);
  }, [picksLocked]);

  function doFinalSubmit(guess?: number) {
    if (!canEditPicks) return;
    const picks = Object.entries(orders).map(([divisionName, order]) => ({
      divisionName: divisionName as NhlNdpPickDivisionName,
      pos1Team: order[0],
      pos2Team: order[1],
      pos3Team: order[2],
      pos4Team: order[3],
      pos5Team: order[4],
      pos6Team: order[5],
      pos7Team: order[6],
      pos8Team: order[7],
    }));
    
    // We send whatever guess is provided (or 0 if somehow not provided and required)
    const payloadTb = typeof guess === "number" ? guess : (myTiebreaker?.tbGuess ?? 0);

    submitPicks.mutate(
      {
        poolId,
        data: {
          picks,
          tbGuess: payloadTb,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Picks locked in!", description: "All 4 division predictions have been saved." });
          setSavedOrders({ ...orders });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpDivisionsQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetNhlNdpMyTiebreakerQueryKey(poolId) });
          void invalidatePoolQueries(queryClient, poolId);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 423) {
            setLockRejected(true);
            setShowTbDialog(false);
            void queryClient.invalidateQueries({ queryKey: getGetNhlNdpLockStateQueryKey(poolId) });
            toast({
              title: "Picks Locked — Season has begun",
              description: "The NHL season has kicked off. All division predictions are now final.",
            });
            return;
          }
          toast({ title: "Submission failed", description: "Something went wrong. Please try again.", variant: "destructive" });
        },
      },
    );
  }

  function handleSubmit() {
    if (!canEditPicks || !allConfirmed) return;
    if (needsTb) {
      setTbGuess("");
      setShowTbDialog(true);
      return;
    }
    doFinalSubmit();
  }

  if (isLoading || !divisions) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[480px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Tiebreaker Dialog — prompted once on first picks submission */}
      <Dialog open={showTbDialog} onOpenChange={(open) => { if (!open) setShowTbDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" /> Tiebreaker Guess
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-snug">
              If scores are tied when the pool closes, your guess for the Atlantic Division combined regular-season points decides the winner. Closest guess wins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Atlantic Division — Combined Points
              </label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 745"
                value={tbGuess}
                onChange={(e) => setTbGuess(e.target.value)}
                className="text-lg font-mono h-12"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="flex flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTbDialog(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 font-bebas text-xl tracking-widest"
              onClick={() => {
                const g = parseInt(tbGuess, 10);
                if (isNaN(g) || g < 0) {
                  toast({ variant: "destructive", title: "Enter a valid guess", description: "Atlantic points guess must be ≥ 0." });
                  return;
                }
                setShowTbDialog(false);
                doFinalSubmit(g);
              }}
            >
              Submit Picks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lockStateUnavailable ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <ShieldAlert className="w-5 h-5 text-amber-200 shrink-0" />
          <div>
            <p className="font-semibold text-sm text-amber-200 leading-snug">
              {isLockStateError ? "Pick availability unavailable" : "Checking pick availability"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLockStateError
                ? "We couldn't confirm whether picks are locked. Please try again shortly."
                : "Picks will be available once their lock status is confirmed."}
            </p>
          </div>
        </div>
      ) : picksLocked ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <Lock className="w-5 h-5 text-amber-500/80" />
          <div>
            <p className="font-semibold text-sm text-amber-200 leading-snug">Picks Locked — Season has begun</p>
            <p className="text-xs text-muted-foreground mt-0.5">The NHL season has kicked off. All division predictions are now final.</p>
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

      {/* Tiebreaker guess receipt — logged-in player only, shown pre-close once submitted */}
      {myTiebreaker?.tbGuess != null && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">Your Tiebreaker Guess</p>
          <div className="flex gap-6">
            <div>
              <p className="text-[10px] text-muted-foreground/60">Atlantic Division points</p>
              <p className="font-bebas text-xl text-yellow-300">{myTiebreaker.tbGuess}</p>
            </div>
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
            ? [
                div.actualResult.pos1Team, div.actualResult.pos2Team, div.actualResult.pos3Team, div.actualResult.pos4Team,
                div.actualResult.pos5Team, div.actualResult.pos6Team, div.actualResult.pos7Team, div.actualResult.pos8Team,
              ] as TeamOrder
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
                      {!actual && !isConfirmed && canEditPicks && (
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

              {canEditPicks && (
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

      {canEditPicks && (hasPendingChanges || (allConfirmed && needsTb)) && (
        <div className="sticky bottom-4 flex justify-center pt-2">
          <div className="flex flex-col sm:flex-row items-center gap-3 rounded-2xl border px-6 py-4 shadow-xl backdrop-blur-sm bg-yellow-500/10 border-yellow-500/40 shadow-yellow-500/10 z-20">
            <div className="text-center sm:text-left">
              <p className="font-bebas text-xl tracking-wider text-yellow-300">
                {needsTb && !hasPendingChanges ? "Tiebreaker guess required!" : "All divisions predicted!"}
              </p>
              <p className="text-xs text-muted-foreground">
                {needsTb && !hasPendingChanges
                  ? "Add your Atlantic Division points guess to finalise your entry"
                  : "Lock in your picks for all 4 NHL divisions"}
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

export function NhlDivisionPredictorView({ poolId, isCommissioner, inviteCode, isSuperAdmin = false }: Props) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bebas text-3xl tracking-wider text-foreground flex items-center gap-2">
          <ListOrdered className="w-7 h-7 text-yellow-400" />
          NHL Division Predictor
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Rank all 8 teams in each of the 4 NHL divisions by their final regular-season standings. 3 pts for exact position, 1 pt for picking a team one position away. Max 96 pts — highest score wins the pot. Lock in picks before the season starts!
        </p>
      </div>

      <Tabs defaultValue="picks" className="w-full">
        <div className="relative">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1 gap-1 w-max md:w-full">
            <TabsTrigger value="picks" data-testid="tab-picks" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2">
              <ListOrdered className="w-4 h-4" /> My Picks
            </TabsTrigger>
            <TabsTrigger value="leaderboard" data-testid="tab-leaderboard" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2">
              <Trophy className="w-4 h-4" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="standings" data-testid="tab-standings" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2">
              <Globe className="w-4 h-4" /> Live Standings
            </TabsTrigger>
            {isCommissioner && (
              <TabsTrigger value="commissioner" data-testid="tab-commissioner" className="shrink-0 font-bebas text-base md:text-lg tracking-wider px-3 md:px-5 py-2 md:py-2.5 gap-2 text-muted-foreground hover:text-foreground md:ml-auto">
                <ShieldAlert className="w-4 h-4" /> Commissioner
              </TabsTrigger>
            )}
          </TabsList>
          </div>
          <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
        </div>

        <TabsContent value="picks" className="m-0 focus-visible:outline-none">
          <MyPicksTab poolId={poolId} />
        </TabsContent>

        <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
          <LeaderboardTab poolId={poolId} />
        </TabsContent>

        <TabsContent value="standings" className="m-0 focus-visible:outline-none">
          <LiveStandingsTab poolId={poolId} />
        </TabsContent>

        {isCommissioner && inviteCode && (
          <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
            <CommissionerTab poolId={poolId} inviteCode={inviteCode} isSuperAdmin={isSuperAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
