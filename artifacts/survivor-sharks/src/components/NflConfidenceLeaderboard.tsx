import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Users, X, Info, Loader2 } from "lucide-react";
import { TiebreakerActualsCard } from "@/components/TiebreakerActualsCard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeasonPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  seasonPoints: number;
  weeklyPoints: Record<number, number>;
}

interface SeasonStandingsResponse {
  currentWeek: number;
  totalWeeks: number;
  players: SeasonPlayer[];
}

interface WeekPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weekPoints: number;
  gradedPicks: number;
  tiebreakerPassingYardsGuess: number | null;
  tiebreakerRushingYardsGuess: number | null;
  tiebreakerDiff1: number | null;
  tiebreakerDiff2: number | null;
  potSplit: boolean;
}

interface WeekLeaderboardResponse {
  week: number;
  players: WeekPlayer[];
  actualPassingYards: number | null;
  actualRushingYards: number | null;
}

interface GridTeam {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface GridGame {
  id: string;
  awayTeam: GridTeam;
  homeTeam: GridTeam;
  startTime: string;
  status: string;
  awayScore: number | null;
  homeScore: number | null;
}

interface GridPick {
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

interface GridPlayerData {
  userId: number;
  username: string;
  displayName: string | null;
  picks: Record<string, GridPick>;
}

interface GridResponse {
  week: number;
  games: GridGame[];
  players: GridPlayerData[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bebas text-xl leading-none">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-bebas text-xl leading-none">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bebas text-xl leading-none">🥉</span>;
  return <span className="font-bebas text-lg text-muted-foreground/60">{rank}</span>;
}

// ── Pick detail panel (rendered inside the expand row) ────────────────────────

function PickCard({ game, pick }: { game: GridGame; pick: GridPick }) {
  const isCorrect = pick.result === "correct";
  const isIncorrect = pick.result === "incorrect";
  const isPending = !isCorrect && !isIncorrect;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg border",
        isCorrect
          ? "border-green-500/25 bg-green-500/[0.06]"
          : isIncorrect
            ? "border-destructive/25 bg-destructive/[0.06]"
            : "border-border/30 bg-muted/10",
      )}
    >
      {/* Confidence badge */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-background border border-muted-foreground/20 flex items-center justify-center">
        <span className="font-bebas text-[15px] leading-none text-foreground/80">
          {pick.confidencePoints ?? "?"}
        </span>
      </div>

      {/* Team logo */}
      {pick.pickedTeamLogoUrl ? (
        <div className="shrink-0 w-7 h-7 rounded-full bg-white/90 p-0.5 flex items-center justify-center">
          <img
            src={pick.pickedTeamLogoUrl}
            alt={pick.pickedTeamName}
            className="w-full h-full object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      ) : (
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center">
          <span className="text-[9px] font-bold uppercase">{pick.pickedTeamName.slice(0, 3)}</span>
        </div>
      )}

      {/* Team + matchup */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {pick.pickedTeamName}
        </p>
        <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
        </p>
      </div>

      {/* Result chip */}
      <span
        className={cn(
          "shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border leading-none",
          isCorrect
            ? "text-green-400 bg-green-500/10 border-green-500/25"
            : isIncorrect
              ? "text-destructive/80 bg-destructive/10 border-destructive/25"
              : "text-muted-foreground/40 bg-muted/10 border-border/30",
        )}
      >
        {isCorrect ? "W" : isIncorrect ? "L" : "–"}
      </span>
    </div>
  );
}

function PickDetailPanel({
  player,
  week,
  gridData,
  isLoading,
  onClose,
}: {
  player: SeasonPlayer;
  week: number;
  gridData: GridResponse | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const playerName = player.displayName ?? player.username;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
          Week {week} picks — {playerName}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors"
          aria-label="Close picks panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Loading state */}
      {(isLoading || !gridData) ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
          <span className="text-sm text-muted-foreground/40">Loading picks…</span>
        </div>
      ) : (() => {
        const gridPlayer = gridData.players.find((p) => p.userId === player.userId);
        const picksMap = gridPlayer?.picks ?? {};

        const picksWithGames = gridData.games
          .map((game) => ({ game, pick: picksMap[game.id] ?? null }))
          .filter(({ pick }) => pick !== null)
          .sort((a, b) => (b.pick!.confidencePoints ?? 0) - (a.pick!.confidencePoints ?? 0));

        if (picksWithGames.length === 0) {
          return (
            <p className="text-sm text-muted-foreground/50 italic py-1">
              No picks submitted this week.
            </p>
          );
        }

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {picksWithGames.map(({ game, pick }) => (
              <PickCard key={game.id} game={game} pick={pick!} />
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NflConfidenceLeaderboard({ poolId }: { poolId: number; initialWeek?: number }) {
  const { user } = useAuth();

  const hintKey = `nfl-confidence-season-hint-${poolId}`;
  const [showHint, setShowHint] = useState<boolean>(() => {
    try { return localStorage.getItem(hintKey) !== "1"; } catch { return true; }
  });

  const [selectedCell, setSelectedCell] = useState<{ userId: number; week: number } | null>(null);

  const { data, isLoading } = useQuery<SeasonStandingsResponse>({
    queryKey: ["nfl-confidence-season-standings", poolId],
    queryFn: () => authedFetch<SeasonStandingsResponse>(`/api/pools/${poolId}/nfl-confidence/season-standings`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const currentWeek = data?.currentWeek ?? 1;

  const { data: weekData } = useQuery<WeekLeaderboardResponse>({
    queryKey: ["nfl-confidence-week-leaderboard", poolId, currentWeek],
    queryFn: () => authedFetch<WeekLeaderboardResponse>(`/api/pools/${poolId}/nfl-confidence/leaderboard?week=${currentWeek}`),
    enabled: !!user && currentWeek >= 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: gridData, isLoading: gridLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-grid-detail", poolId, selectedCell?.week],
    queryFn: () =>
      authedFetch<GridResponse>(`/api/pools/${poolId}/nfl-confidence/grid?week=${selectedCell!.week}`),
    enabled: !!selectedCell,
    staleTime: 60_000,
  });

  const weekPlayers = weekData?.players ?? [];
  const isWeekGraded = weekData?.actualPassingYards != null;

  const tiedTopPlayers: WeekPlayer[] = (() => {
    if (!isWeekGraded || weekPlayers.length === 0) return [];
    const groups = new Map<number, WeekPlayer[]>();
    for (const p of weekPlayers) {
      const pts = Number(p.weekPoints);
      if (!groups.has(pts)) groups.set(pts, []);
      groups.get(pts)!.push(p);
    }
    const sortedPts = [...groups.keys()].sort((a, b) => b - a);
    for (const pts of sortedPts) {
      const group = groups.get(pts)!;
      if (group.length >= 2) {
        return group.slice().sort((a, b) => {
          const d1 = (a.tiebreakerDiff1 ?? Infinity) - (b.tiebreakerDiff1 ?? Infinity);
          return d1 !== 0 ? d1 : (a.tiebreakerDiff2 ?? Infinity) - (b.tiebreakerDiff2 ?? Infinity);
        });
      }
    }
    return [];
  })();
  const hasTie = tiedTopPlayers.length >= 2;

  const weekColumns = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const players = data?.players ?? [];

  function handleCellClick(userId: number, week: number) {
    if (selectedCell?.userId === userId && selectedCell?.week === week) {
      setSelectedCell(null);
    } else {
      setSelectedCell({ userId, week });
    }
  }

  const colSpan = weekColumns.length + 3;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide mb-1">No Picks Yet</p>
        <p className="text-sm">Nobody has submitted graded picks this season.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Instructional hint banner ─────────────────────────────────────── */}
      {showHint && (
        <div className="relative flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 pr-10">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200/80">
            Click any week's result to see that player's picks for that week.
          </p>
          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem(hintKey, "1"); } catch { /* ignore */ }
              setShowHint(false);
            }}
            className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Dismiss hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Leaderboard table ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card z-10 w-8 px-1 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center">
                #
              </th>
              <th className="w-44 px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-left">
                Player
              </th>
              {weekColumns.map((wk) => (
                <th
                  key={wk}
                  className="w-11 px-0.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center"
                >
                  W{wk}
                </th>
              ))}
              <th className="w-16 px-1 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-right pr-2">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {players.map((player) => {
              const isMe = player.userId === user?.id;
              const isExpanded = selectedCell?.userId === player.userId;
              const rowBg = isMe
                ? "bg-purple-500/5"
                : player.rank === 1
                  ? "bg-yellow-500/5"
                  : "";

              return (
                <Fragment key={player.userId}>
                  {/* ── Player row ── */}
                  <tr className={cn("border-b border-border/20", rowBg)}>
                    {/* Rank — sticky, needs explicit bg to cover scroll */}
                    <td
                      className={cn(
                        "sticky left-0 z-10 px-1 py-2.5 text-center",
                        isMe ? "bg-[color-mix(in_srgb,var(--color-card)_95%,rgba(168,85,247,0.15)_5%)]"
                          : player.rank === 1 ? "bg-[color-mix(in_srgb,var(--color-card)_95%,rgba(234,179,8,0.1)_5%)]"
                          : "bg-card",
                      )}
                    >
                      <RankBadge rank={player.rank} />
                    </td>

                    {/* Player name */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-semibold truncate",
                            isMe ? "text-purple-300" : "text-foreground",
                          )}
                        >
                          {player.displayName ?? player.username}
                        </span>
                        {isMe && (
                          <span className="shrink-0 text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Week cells — clickable */}
                    {weekColumns.map((wk) => {
                      const pts = player.weeklyPoints[wk];
                      const hasData = pts !== undefined;
                      const isCellActive =
                        isExpanded && selectedCell?.week === wk;

                      return (
                        <td
                          key={wk}
                          onClick={() => handleCellClick(player.userId, wk)}
                          title={hasData ? `${player.displayName ?? player.username} — Wk${wk}: ${pts} pts` : `${player.displayName ?? player.username} — Wk${wk}: no picks`}
                          className={cn(
                            "px-0.5 py-2.5 text-center cursor-pointer select-none transition-colors rounded-sm",
                            isCellActive
                              ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
                              : "hover:bg-muted/40",
                          )}
                        >
                          {hasData ? (
                            <span
                              className={cn(
                                "font-bebas text-base leading-none tabular-nums",
                                pts > 0
                                  ? "text-foreground/80"
                                  : "text-muted-foreground/30",
                              )}
                            >
                              {pts}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/25 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Season total */}
                    <td className="pr-2 py-2.5 text-right">
                      <span
                        className={cn(
                          "font-bebas text-xl leading-none tabular-nums",
                          player.seasonPoints > 0
                            ? "text-green-400"
                            : "text-muted-foreground/30",
                        )}
                      >
                        {player.seasonPoints}
                      </span>
                    </td>
                  </tr>

                  {/* ── Expand row ── */}
                  {isExpanded && (
                    <tr className="bg-muted/[0.04]">
                      <td
                        colSpan={colSpan}
                        className="px-4 py-4 border-b border-border/30"
                      >
                        <PickDetailPanel
                          player={player}
                          week={selectedCell!.week}
                          gridData={gridData ?? null}
                          isLoading={gridLoading}
                          onClose={() => setSelectedCell(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Tiebreaker card ───────────────────────────────────────────────── */}
      {isWeekGraded && weekData?.actualPassingYards != null && (
        <TiebreakerActualsCard
          actualPassingYards={weekData.actualPassingYards}
          actualRushingYards={weekData.actualRushingYards ?? null}
          tiedPlayers={hasTie ? tiedTopPlayers : []}
        />
      )}

      <p className="text-[11px] text-muted-foreground/40 text-center">
        Points = confidence points from correct picks only · Total = season cumulative · Click a week cell to view picks
      </p>
    </div>
  );
}
