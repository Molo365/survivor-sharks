import { useState, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Trophy, Users, CheckCircle2, XCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerPick {
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

interface PlayerRow {
  userId: number;
  username: string;
  displayName: string | null;
  picks: Record<string, PlayerPick>;
}

interface GridResponse {
  date: string;
  dateLabel: string;
  games: unknown[];
  players: PlayerRow[];
}

interface WeekDayBreakdown {
  date: string;
  dateLabel: string;
  pointsEarned: number;
  pointsPossible: number;
  pending: number;
}

interface WeeklyPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weeklyPoints: number;
  days: WeekDayBreakdown[];
}

interface WeeklyLeaderboardResponse {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  players: WeeklyPlayer[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayAbbrev(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return SHORT_DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function getTodayEt(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function getMondayEt(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(y, m - 1, d + daysToMon)).toISOString().slice(0, 10);
}

function getCurrentNhlSat(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const daysBack = (dow + 1) % 7;
  return new Date(dt.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("Request failed");
    return r.json() as Promise<T>;
  });
}

// ── Rank badge ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bebas text-base sm:text-xl leading-none">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-bebas text-base sm:text-xl leading-none">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bebas text-base sm:text-xl leading-none">🥉</span>;
  return <span className="font-bebas text-sm sm:text-lg text-muted-foreground/60 w-6 text-center">{rank}</span>;
}

// ── Day pick detail panel ─────────────────────────────────────────────────────
// Fetches the grid for a specific date and shows one player's 8 picks.

function CrazyEightsDayPanel({ poolId, userId, date }: { poolId: number; userId: number; date: string }) {
  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["crazy-eights-grid", poolId, date],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/crazy-eights/grid?date=${date}`),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="px-3 py-3 space-y-2 border-t border-border/10 bg-muted/5">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
      </div>
    );
  }

  const playerRow = data?.players.find((p) => p.userId === userId);
  const picks = playerRow ? Object.values(playerRow.picks) : [];

  if (picks.length === 0) {
    return (
      <div className="px-3 py-3 text-sm text-center text-muted-foreground border-t border-border/10 bg-muted/5">
        No picks recorded for this day.
      </div>
    );
  }

  const sorted = [...picks].sort((a, b) => (b.confidencePoints ?? 0) - (a.confidencePoints ?? 0));

  return (
    <div className="px-3 py-3 space-y-1.5 border-t border-border/10 bg-muted/5">
      {sorted.map((pick, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 border",
            pick.result === "correct"
              ? "bg-green-500/[0.08] border-green-500/20"
              : pick.result === "incorrect"
              ? "bg-red-500/[0.08] border-red-500/20"
              : "bg-card/40 border-border/20",
          )}
        >
          {/* Result icon */}
          <div className="shrink-0 w-4">
            {pick.result === "correct" ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : pick.result === "incorrect" ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-primary/30" />
            )}
          </div>

          {/* Team logo + name */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {pick.pickedTeamLogoUrl && (
              <img src={pick.pickedTeamLogoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className={cn(
              "font-medium text-sm truncate",
              pick.result === "correct" ? "text-green-300"
                : pick.result === "incorrect" ? "text-red-300"
                : "text-foreground",
            )}>
              {pick.pickedTeamName}
            </span>
          </div>

          {/* Confidence points */}
          <span className={cn(
            "font-bebas text-lg leading-none shrink-0 tabular-nums",
            pick.result === "correct" ? "text-green-400"
              : pick.result === "incorrect" ? "text-red-400/60"
              : "text-muted-foreground/50",
          )}>
            {pick.confidencePoints ?? "—"}
          </span>
          <span className="text-[9px] text-muted-foreground/40 shrink-0">pts</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CrazyEightsLeaderboard({ poolId, sport = "mlb", sandboxMode = false, defaultToPreviousWeek = false }: { poolId: number; sport?: string; sandboxMode?: boolean; defaultToPreviousWeek?: boolean }) {
  const { user } = useAuth();
  const isNhl = sport === "nhl";

  // ── State (all hooks before any conditional return) ────────────────────────

  const [nhlDate, setNhlDate] = useState(() => {
    if (!isNhl) return "";
    return sandboxMode ? "" : getCurrentNhlSat();
  });

  const [mlbWeekOf, setMlbWeekOf] = useState(() => {
    const monday = getMondayEt();
    if (defaultToPreviousWeek) {
      const [y, m, d] = monday.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
    }
    return monday;
  });

  // Expand state: which (userId, date) cell is open — shared across both paths
  const [openCell, setOpenCell] = useState<{ userId: number; date: string } | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: nhlData, isLoading: nhlLoading } = useQuery<GridResponse>({
    queryKey: ["crazy-eights-grid", poolId, nhlDate],
    queryFn: () => authedFetch<GridResponse>(`/api/pools/${poolId}/crazy-eights/grid?date=${nhlDate}`),
    enabled: !!user && isNhl,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: mlbData, isLoading: mlbLoading } = useQuery<WeeklyLeaderboardResponse>({
    queryKey: ["crazy-eights-weekly-leaderboard", poolId, mlbWeekOf],
    queryFn: () => authedFetch<WeeklyLeaderboardResponse>(`/api/pools/${poolId}/crazy-eights/weekly-leaderboard?weekOf=${mlbWeekOf}`),
    enabled: !!user && !isNhl,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Lock in NHL anchor date on first load (sandbox NHL resolves date from server)
  useEffect(() => {
    if (isNhl && nhlDate === "" && nhlData?.date) setNhlDate(nhlData.date);
  }, [isNhl, nhlDate, nhlData?.date]);

  const currentMonday = getMondayEt();
  const isCurrentMlbWeek = mlbWeekOf >= currentMonday;

  function toggleCell(userId: number, date: string) {
    setOpenCell((prev) =>
      prev?.userId === userId && prev.date === date ? null : { userId, date },
    );
  }

  // ── NHL render — unchanged date-based leaderboard ─────────────────────────

  if (isNhl) {
    const maxDate = sandboxMode ? (nhlData?.date ?? "") : getCurrentNhlSat();
    const isAtMax = nhlDate === "" || nhlDate >= maxDate;

    const ranked = (nhlData?.players ?? [])
      .map((p) => {
        const picks = Object.values(p.picks);
        const won = picks.filter((pk) => pk.result === "correct");
        const pending = picks.filter((pk) => pk.result == null || pk.result === "pending");
        const lost = picks.filter((pk) => pk.result === "incorrect");
        const pointsEarned = won.reduce((s, pk) => s + (pk.confidencePoints ?? 0), 0);
        const pointsPossible = picks.reduce((s, pk) => s + (pk.confidencePoints ?? 0), 0);
        return { ...p, won: won.length, lost: lost.length, pending: pending.length, total: picks.length, pointsEarned, pointsPossible };
      })
      .sort((a, b) => b.pointsEarned - a.pointsEarned || b.pointsPossible - a.pointsPossible);

    if (nhlLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setNhlDate((d) => offsetDate(d, -7))}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="font-bebas text-lg tracking-wide leading-none">{nhlData?.dateLabel ?? nhlDate}</p>
            {isAtMax && (
              <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">This Weekend</span>
            )}
          </div>
          <button
            onClick={() => setNhlDate((d) => offsetDate(d, 7))}
            disabled={isAtMax}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {ranked.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
            <p className="text-sm">Nobody has submitted picks for this weekend.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map((player, idx) => {
              const rank = idx + 1;
              const isMe = player.userId === user?.id;
              const allDone = player.pending === 0;
              return (
                <div
                  key={player.userId}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-3 rounded-lg border transition-all",
                    isMe ? "border-purple-500/40 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.08)]" : "border-border/30 bg-card/40",
                    rank === 1 ? "border-yellow-500/30 bg-yellow-500/5" : "",
                  )}
                >
                  <div className="w-8 flex items-center justify-center shrink-0">
                    <RankBadge rank={rank} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-semibold truncate", isMe ? "text-purple-300" : "text-foreground")}>
                        {player.displayName ?? player.username}
                      </span>
                      {isMe && (
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">You</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-green-400">{player.won}W</span>
                      <span className="text-[11px] text-red-400">{player.lost}L</span>
                      {player.pending > 0 && (
                        <span className="text-[11px] text-muted-foreground/50">{player.pending} pending</span>
                      )}
                      <span className="text-[11px] text-muted-foreground/40">of {player.total} picks</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bebas text-xl sm:text-2xl leading-none">
                      <span className={cn(player.pointsEarned > 0 ? "text-green-400" : "text-muted-foreground/40")}>
                        {player.pointsEarned}
                      </span>
                      {!allDone && (
                        <span className="text-sm text-muted-foreground/40">/{player.pointsPossible}</span>
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                      {allDone ? "pts" : "pts earned"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {ranked.length > 0 && (
          <p className="text-[11px] text-muted-foreground/40 text-center">
            Points earned = confidence points from correct picks only
          </p>
        )}
      </div>
    );
  }

  // ── MLB weekly render ──────────────────────────────────────────────────────

  if (mlbLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const players = mlbData?.players ?? [];
  const weekLabel = mlbData?.weekLabel ?? "";
  const weekStart = mlbData?.weekStart ?? "";

  // Mon–Sun date strings for column headers
  const weekDays = weekStart
    ? Array.from({ length: 7 }, (_, i) => offsetDate(weekStart, i))
    : [];

  const todayEt = getTodayEt();
  const weekWinner = !isCurrentMlbWeek && players.length > 0 ? players[0] : null;

  // Table min-width: sticky player col (100 mobile / 150 desktop) + 7 day cols (52px each) + total col (80)
  const minWidth = Math.max(380, 100 + weekDays.length * 52 + 80);

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => { setMlbWeekOf((w) => offsetDate(w, -7)); setOpenCell(null); }}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="font-bebas text-lg tracking-wide leading-none">{weekLabel}</p>
          {isCurrentMlbWeek && (
            <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">This Week</span>
          )}
        </div>
        <button
          onClick={() => { setMlbWeekOf((w) => offsetDate(w, 7)); setOpenCell(null); }}
          disabled={isCurrentMlbWeek}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Winner banner — shown when viewing a completed past week */}
      {weekWinner && (
        <div className="rounded-lg border border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 to-amber-600/5 px-4 py-3.5 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-0.5">Week Winner</p>
            <p className="font-bebas text-lg tracking-wide leading-none text-foreground truncate">
              {weekWinner.displayName ?? weekWinner.username}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bebas text-2xl text-yellow-400 leading-none">{weekWinner.weeklyPoints}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">pts</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm border-separate border-spacing-0"
            style={{ minWidth: `${minWidth}px` }}
          >
            <thead>
              <tr className="bg-muted/[0.05]">
                {/* Sticky player header */}
                <th className="sticky left-0 z-20 bg-card px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-bebas text-xs tracking-wider text-muted-foreground/40 min-w-[100px] sm:min-w-[150px]">
                  Player
                </th>
                {/* Day headers */}
                {weekDays.map((date) => (
                  <th
                    key={date}
                    className={cn(
                      "px-1 py-2 text-center border-b border-border/30 font-bold text-[9px] uppercase tracking-wider whitespace-nowrap",
                      date === todayEt ? "text-primary" : "text-muted-foreground/40",
                    )}
                    style={{ width: 52 }}
                  >
                    {dayAbbrev(date)}
                  </th>
                ))}
                {/* Total header */}
                <th
                  className="px-3 py-2 text-right border-b border-border/30 font-bold text-[9px] uppercase tracking-wider text-muted-foreground/40 whitespace-nowrap"
                  style={{ width: 80 }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td
                    colSpan={weekDays.length + 2}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No picks yet this week.
                  </td>
                </tr>
              ) : (
                players.map((player, idx) => {
                  const isMe = player.userId === user?.id;
                  const dayMap = new Map(player.days.map((d) => [d.date, d]));
                  const isPanelOpen = openCell?.userId === player.userId;
                  const rowBg = isMe
                    ? "bg-primary/5"
                    : idx % 2 === 0
                    ? "bg-transparent"
                    : "bg-muted/[0.03]";

                  return (
                    <Fragment key={player.userId}>
                      <tr className={cn("border-b border-border/10", isPanelOpen && "border-b-0")}>
                        {/* Sticky player cell */}
                        <td
                          className={cn(
                            "sticky left-0 z-20 px-3 py-1.5 sm:py-2.5 border-r border-border/20 min-w-[100px] sm:min-w-[150px]",
                            isMe ? "bg-[hsl(215,50%,7%)]" : "bg-card",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-bebas text-base w-5 shrink-0 text-center",
                                player.rank === 1
                                  ? "text-yellow-400"
                                  : player.rank === 2
                                  ? "text-zinc-300"
                                  : player.rank === 3
                                  ? "text-amber-600"
                                  : "text-muted-foreground/40",
                              )}
                            >
                              {player.rank}
                            </span>
                            <span className={cn("font-medium text-sm truncate", isMe ? "text-primary" : "text-foreground")}>
                              {player.displayName || player.username}
                              {isMe && (
                                <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Per-day cells */}
                        {weekDays.map((date) => {
                          const day = dayMap.get(date);
                          const isPast = date < todayEt;
                          const isToday = date === todayEt;
                          const isCellOpen = isPanelOpen && openCell?.date === date;

                          return (
                            <td key={date} className={cn("px-0.5 py-1.5 text-center", rowBg)}>
                              {day ? (
                                <button
                                  type="button"
                                  title={`View ${dayAbbrev(date)} picks`}
                                  onClick={() => toggleCell(player.userId, date)}
                                  className={cn(
                                    "w-10 h-9 flex flex-col items-center justify-center rounded-md border mx-auto transition-all cursor-pointer",
                                    isCellOpen
                                      ? "ring-2 ring-primary/50 border-primary/50 bg-primary/10"
                                      : day.pointsEarned > 0
                                      ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                                      : day.pending > 0
                                      ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                                      : "bg-muted/20 border-border/30 hover:bg-muted/30",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "font-bebas text-sm leading-none",
                                      isCellOpen
                                        ? "text-primary"
                                        : day.pointsEarned > 0
                                        ? "text-green-400"
                                        : day.pending > 0
                                        ? "text-amber-400"
                                        : "text-muted-foreground/50",
                                    )}
                                  >
                                    {day.pointsEarned}
                                  </span>
                                  {day.pending > 0 && (
                                    <span className="text-[8px] text-amber-400/50 leading-none">pend</span>
                                  )}
                                </button>
                              ) : (isPast || isToday) ? (
                                <div
                                  className={cn(
                                    "w-10 h-9 flex items-center justify-center rounded-md border mx-auto",
                                    isToday
                                      ? "border-primary/20 bg-primary/5"
                                      : "border-border/15 bg-transparent",
                                  )}
                                >
                                  <span className={cn("text-xs", isToday ? "text-primary/30" : "text-muted-foreground/20")}>—</span>
                                </div>
                              ) : (
                                <div className="w-10 h-9 flex items-center justify-center rounded-md border border-border/10 bg-transparent mx-auto">
                                  <span className="text-[10px] text-muted-foreground/15">·</span>
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Weekly total */}
                        <td className={cn("px-3 py-1.5 sm:py-2.5 text-right", rowBg)}>
                          <span className="font-bebas text-xl text-foreground">{player.weeklyPoints}</span>
                          <div className="text-[10px] text-muted-foreground/50 leading-none">pts</div>
                        </td>
                      </tr>

                      {/* Expandable pick detail panel */}
                      {isPanelOpen && openCell && (
                        <tr className="border-b border-border/10">
                          <td colSpan={weekDays.length + 2} className="p-0">
                            <CrazyEightsDayPanel
                              poolId={poolId}
                              userId={player.userId}
                              date={openCell.date}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/40 text-center">
        Points accumulate Mon–Sun · Winner declared Sunday night
      </p>
    </div>
  );
}
