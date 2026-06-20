import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ListOrdered, Shield, Skull } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  status: "active" | "eliminated";
  weeksAlive: number;
  eliminatedWeek: number | null;
  lastPickTeam: string | null;
  lastPickResult: string | null;
  streak: number | null;
  strikeCount: number | null;
  hasWonThisWeek: boolean;
  prizeWon: number | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SurvivorStandings({ poolId }: { poolId: number }) {
  const { user } = useAuth();

  const { data: leaderboard, isLoading } = useGetLeaderboard(poolId, {
    query: { enabled: !!poolId, queryKey: getGetLeaderboardQueryKey(poolId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-44" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!leaderboard) return null;

  const alive = (leaderboard.active ?? []) as LeaderboardEntry[];
  const eliminated = (leaderboard.eliminated ?? []) as LeaderboardEntry[];
  const currentWeek = leaderboard.currentWeek ?? 1;

  // Alive: already sorted by weeksAlive DESC from server (rank order)
  // Eliminated: sort by eliminatedWeek DESC — most recently eliminated first
  const sortedEliminated = [...eliminated].sort(
    (a, b) => (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0),
  );

  const totalPlayers = alive.length + eliminated.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-bebas text-2xl tracking-wide text-foreground flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-primary" />
          Player Standings
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {alive.length} survivor{alive.length !== 1 ? "s" : ""} alive ·{" "}
          {eliminated.length} eliminated · Week {currentWeek} · {totalPlayers} total
        </p>
      </div>

      {totalPlayers === 0 ? (
        <div className="rounded-xl border border-border/30 bg-muted/[0.03] py-14 flex flex-col items-center gap-2 text-center">
          <p className="font-bebas text-xl tracking-wide text-muted-foreground/50">
            No Players Yet
          </p>
          <p className="text-sm text-muted-foreground/40">
            Standings will appear once players have joined.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Alive section ─────────────────────────────── */}
          {alive.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-bebas text-sm tracking-widest text-emerald-400/60 uppercase flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Alive — {alive.length}
              </h4>
              <div className="space-y-1.5">
                {alive.map((entry) => {
                  const isMe = entry.userId === user?.id;
                  const name = entry.displayName ?? entry.username;
                  const hasPick = !!entry.lastPickTeam;

                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                        isMe
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/30 bg-card hover:bg-muted/[0.04]",
                      )}
                    >
                      {/* Rank */}
                      <span
                        className={cn(
                          "font-bebas text-xl w-7 shrink-0 text-center leading-none",
                          entry.rank === 1
                            ? "text-yellow-400"
                            : entry.rank === 2
                            ? "text-zinc-300"
                            : entry.rank === 3
                            ? "text-amber-600"
                            : "text-muted-foreground/40",
                        )}
                      >
                        {entry.rank}
                      </span>

                      {/* Name + streak */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "font-semibold text-sm truncate",
                              isMe ? "text-primary" : "text-foreground",
                            )}
                          >
                            {name}
                          </span>
                          {isMe && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-primary/50 shrink-0">
                              you
                            </span>
                          )}
                          {(entry.streak ?? 0) > 1 && (
                            <span className="text-[10px] text-emerald-400/60 font-mono shrink-0">
                              🔥{entry.streak}wk
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground/50 mt-0.5">
                          {entry.weeksAlive} wk{entry.weeksAlive !== 1 ? "s" : ""} survived
                        </div>
                      </div>

                      {/* This week's pick */}
                      <div className="shrink-0 text-right min-w-0 max-w-[150px]">
                        <div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-0.5">
                          Wk {currentWeek} pick
                        </div>
                        {hasPick ? (
                          <span
                            className={cn(
                              "font-bebas text-sm tracking-wide leading-none",
                              entry.lastPickResult === "win"
                                ? "text-emerald-400"
                                : entry.lastPickResult === "loss"
                                ? "text-destructive/70"
                                : "text-foreground/70",
                            )}
                          >
                            {entry.lastPickTeam}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs italic">No pick</span>
                        )}
                      </div>

                      {/* Status badge */}
                      <div className="shrink-0 ml-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                          <Shield className="w-2.5 h-2.5" />
                          Alive
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Eliminated section ────────────────────────── */}
          {sortedEliminated.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-bebas text-sm tracking-widest text-destructive/50 uppercase flex items-center gap-1.5">
                <Skull className="w-3.5 h-3.5" />
                Eliminated — {sortedEliminated.length}
              </h4>
              <div className="space-y-1.5">
                {sortedEliminated.map((entry, idx) => {
                  const isMe = entry.userId === user?.id;
                  const name = entry.displayName ?? entry.username;
                  const elimWeek = entry.eliminatedWeek ?? "?";
                  const teamName = entry.lastPickTeam ?? "Unknown";

                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border opacity-55 transition-colors",
                        isMe
                          ? "border-destructive/20 bg-destructive/[0.03]"
                          : "border-border/20 bg-card/50",
                      )}
                    >
                      {/* Rank (among eliminated — most recently eliminated = top) */}
                      <span className="font-bebas text-xl w-7 shrink-0 text-center leading-none text-muted-foreground/30">
                        {alive.length + idx + 1}
                      </span>

                      {/* Name (strikethrough) */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "font-semibold text-sm line-through decoration-muted-foreground/40 truncate",
                              isMe ? "text-destructive/60" : "text-muted-foreground/50",
                            )}
                          >
                            {name}
                          </span>
                          {isMe && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-destructive/40 shrink-0">
                              you
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground/35 mt-0.5">
                          Eliminated wk {elimWeek}
                        </div>
                      </div>

                      {/* Fatal pick */}
                      <div className="shrink-0 text-right min-w-0 max-w-[160px]">
                        <div className="text-[10px] text-muted-foreground/30 uppercase tracking-wider mb-0.5">
                          Went out on
                        </div>
                        <span className="font-bebas text-sm tracking-wide leading-none text-destructive/50">
                          {teamName}
                          <span className="text-muted-foreground/30 font-mono text-[10px] ml-1">
                            (wk {elimWeek})
                          </span>
                        </span>
                      </div>

                      {/* Status badge */}
                      <div className="shrink-0 ml-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive/60 text-[10px] font-bold uppercase tracking-wider">
                          <Skull className="w-2.5 h-2.5" />
                          Out
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
