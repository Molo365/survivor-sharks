import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ListOrdered } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StandingsPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weeklyPoints: Record<number, number>;
  seasonPoints: number;
}

interface StandingsResponse {
  currentWeek: number;
  totalWeeks: number;
  players: StandingsPlayer[];
}

// ── Auth fetch ────────────────────────────────────────────────────────────────

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NflConfidenceStandings({ poolId }: { poolId: number }) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<StandingsResponse>({
    queryKey: ["nfl-confidence-standings", poolId],
    queryFn: () =>
      authedFetch<StandingsResponse>(`/api/pools/${poolId}/nfl-confidence/season-standings`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const players = data?.players ?? [];
  const currentWeek = data?.currentWeek ?? 1;

  // Weeks to display: 1 through currentWeek, only if at least some picks exist for it
  const weeksWithData = new Set<number>();
  for (const p of players) {
    for (const w of Object.keys(p.weeklyPoints)) {
      weeksWithData.add(Number(w));
    }
  }
  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1).filter(
    (w) => weeksWithData.has(w),
  );

  const minWidth = Math.max(500, 200 + weeks.length * 64 + 100);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-44" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-bebas text-2xl tracking-wide text-foreground flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-purple-400" />
          Season Standings
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Confidence points earned per week · {players.length} player{players.length !== 1 ? "s" : ""} · Weeks{" "}
          {weeks.length > 0 ? `1–${weeks[weeks.length - 1]}` : "—"}
        </p>
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-muted/[0.03] py-14 flex flex-col items-center gap-2 text-center">
          <p className="font-bebas text-xl tracking-wide text-muted-foreground/50">
            No Graded Picks Yet
          </p>
          <p className="text-sm text-muted-foreground/40">
            Standings will appear once the first week is graded.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm border-separate border-spacing-0"
                style={{ minWidth: `${minWidth}px` }}
              >
                <thead>
                  <tr className="bg-muted/[0.05]">
                    {/* Player column */}
                    <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2.5 border-b border-border/30 border-r border-border/20 text-left font-medium text-muted-foreground/60 text-xs whitespace-nowrap">
                      Player
                    </th>
                    {/* Week columns */}
                    {weeks.map((w) => (
                      <th
                        key={w}
                        className={cn(
                          "px-1 py-2.5 text-center border-b border-border/30 font-mono text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap",
                          w === currentWeek && "text-purple-400/70",
                        )}
                        style={{ width: 64 }}
                      >
                        Wk {w}
                        {w === currentWeek && (
                          <div className="text-[8px] text-purple-400/50 uppercase tracking-wider leading-none mt-0.5">
                            current
                          </div>
                        )}
                      </th>
                    ))}
                    {/* Season total */}
                    <th className="px-4 py-2.5 text-right border-b border-border/30 font-bebas text-xs text-purple-400/60 whitespace-nowrap">
                      Season Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {players.map((p, idx) => {
                    const isMe = p.userId === user?.id;
                    const isLeader = idx === 0;
                    return (
                      <tr
                        key={p.userId}
                        className={cn(
                          idx < players.length - 1 &&
                            "[&>td]:border-b [&>td]:border-white/[0.06]",
                          isMe
                            ? "bg-primary/5"
                            : idx % 2 === 0
                            ? "bg-transparent"
                            : "bg-muted/[0.03]",
                        )}
                      >
                        {/* Sticky player info */}
                        <td
                          className={cn(
                            "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30 bg-card whitespace-nowrap",
                            isMe && "ring-inset ring-1 ring-primary/20",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-bebas text-base w-5 shrink-0",
                                p.rank === 1
                                  ? "text-yellow-400"
                                  : p.rank === 2
                                  ? "text-zinc-300"
                                  : p.rank === 3
                                  ? "text-amber-600"
                                  : "text-muted-foreground/40",
                              )}
                            >
                              {p.rank}
                            </span>
                            <span
                              className={cn(
                                "font-medium text-sm truncate max-w-[130px]",
                                isMe
                                  ? "text-primary"
                                  : isLeader
                                  ? "text-foreground"
                                  : "text-foreground/80",
                              )}
                            >
                              {p.displayName ?? p.username}
                              {isMe && (
                                <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                                  you
                                </span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Per-week point cells */}
                        {weeks.map((w) => {
                          const pts = p.weeklyPoints[w];
                          const hasPoints = pts != null && pts > 0;
                          const isZero = pts != null && pts === 0;
                          return (
                            <td
                              key={w}
                              className={cn(
                                "px-1 py-2.5 text-center whitespace-nowrap",
                                w === currentWeek && "bg-purple-500/[0.04]",
                              )}
                            >
                              {pts == null ? (
                                <span className="text-muted-foreground/20 text-xs">—</span>
                              ) : (
                                <span
                                  className={cn(
                                    "font-bebas text-base leading-none",
                                    hasPoints
                                      ? w === currentWeek
                                        ? "text-purple-300"
                                        : "text-foreground/90"
                                      : isZero
                                      ? "text-muted-foreground/30"
                                      : "text-muted-foreground/20",
                                  )}
                                >
                                  {pts}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Season total */}
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span
                            className={cn(
                              "font-bebas text-xl leading-none",
                              isLeader ? "text-purple-300" : isMe ? "text-primary" : "text-foreground/80",
                            )}
                          >
                            {p.seasonPoints}
                          </span>
                          <span className="font-bebas text-sm text-muted-foreground/40 ml-1">
                            pts
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/40 text-center">
            Points shown are from graded weeks only · Scroll right to see all weeks ·
            Updates automatically
          </p>
        </>
      )}
    </div>
  );
}
