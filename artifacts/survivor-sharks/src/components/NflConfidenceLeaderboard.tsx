import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { TiebreakerActualsCard } from "@/components/TiebreakerActualsCard";
import {
  PoolLeaderboardGrid,
  type WeekCellDescriptor,
} from "@/components/PoolLeaderboardGrid";

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

// ── Confidence pick card ──────────────────────────────────────────────────────

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
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center">
          <span className="text-[9px] font-bold uppercase">
            {pick.pickedTeamName.slice(0, 3)}
          </span>
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
        {isCorrect ? "W" : isIncorrect ? "L" : isPending ? "–" : "–"}
      </span>
    </div>
  );
}

// ── Confidence expand panel ───────────────────────────────────────────────────

function ConfidencePickDetailPanel({
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

  const picksWithGames = useMemo(() => {
    if (!gridData) return null;
    const gridPlayer = gridData.players.find((p) => p.userId === player.userId);
    const picksMap = gridPlayer?.picks ?? {};
    return gridData.games
      .map((game) => ({ game, pick: picksMap[game.id] ?? null }))
      .filter(({ pick }) => pick !== null)
      .sort((a, b) => (b.pick!.confidencePoints ?? 0) - (a.pick!.confidencePoints ?? 0)) as {
        game: GridGame;
        pick: GridPick;
      }[];
  }, [gridData, player.userId]);

  return (
    <div>
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

      {isLoading || !gridData ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
          <span className="text-sm text-muted-foreground/40">
            Loading picks…
          </span>
        </div>
      ) : picksWithGames && picksWithGames.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {picksWithGames.map(({ game, pick }) => (
            <PickCard key={game.id} game={game} pick={pick} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic py-1">
          No picks submitted this week.
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NflConfidenceLeaderboard({
  poolId,
}: {
  poolId: number;
  initialWeek?: number;
}) {
  const { user } = useAuth();

  const [selectedCell, setSelectedCell] = useState<{
    userId: number;
    week: number;
  } | null>(null);

  const { data, isLoading } = useQuery<SeasonStandingsResponse>({
    queryKey: ["nfl-confidence-season-standings", poolId],
    queryFn: () =>
      authedFetch<SeasonStandingsResponse>(
        `/api/pools/${poolId}/nfl-confidence/season-standings`,
      ),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const currentWeek = data?.currentWeek ?? 1;

  const { data: weekData } = useQuery<WeekLeaderboardResponse>({
    queryKey: ["nfl-confidence-week-leaderboard", poolId, currentWeek],
    queryFn: () =>
      authedFetch<WeekLeaderboardResponse>(
        `/api/pools/${poolId}/nfl-confidence/leaderboard?week=${currentWeek}`,
      ),
    enabled: !!user && currentWeek >= 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: gridData, isLoading: gridLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-grid-detail", poolId, selectedCell?.week],
    queryFn: () =>
      authedFetch<GridResponse>(
        `/api/pools/${poolId}/nfl-confidence/grid?week=${selectedCell!.week}`,
      ),
    enabled: !!selectedCell,
    staleTime: 60_000,
  });

  const weekPlayers = weekData?.players ?? [];
  const isWeekGraded = weekData?.actualPassingYards != null;

  const tiedTopPlayers = useMemo((): WeekPlayer[] => {
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
          const d1 =
            (a.tiebreakerDiff1 ?? Infinity) - (b.tiebreakerDiff1 ?? Infinity);
          return d1 !== 0
            ? d1
            : (a.tiebreakerDiff2 ?? Infinity) - (b.tiebreakerDiff2 ?? Infinity);
        });
      }
    }
    return [];
  }, [isWeekGraded, weekPlayers]);

  const hasTie = tiedTopPlayers.length >= 2;
  const weekColumns = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const players = data?.players ?? [];

  // ── Render props for PoolLeaderboardGrid ───────────────────────────────────

  function renderWeekCell(
    player: SeasonPlayer,
    wk: number,
  ): WeekCellDescriptor {
    const pts = player.weeklyPoints[wk];
    const hasData = pts !== undefined;
    return {
      clickable: hasData,
      tooltip: hasData
        ? `${player.displayName ?? player.username} — Wk${wk}: ${pts} pts`
        : `${player.displayName ?? player.username} — Wk${wk}: no picks`,
      content: hasData ? (
        <span
          className={cn(
            "font-bebas text-base leading-none tabular-nums",
            pts > 0 ? "text-foreground/80" : "text-muted-foreground/30",
          )}
        >
          {pts}
        </span>
      ) : (
        <span className="text-muted-foreground/25 text-xs">—</span>
      ),
    };
  }

  function renderTotal(player: SeasonPlayer) {
    return (
      <span
        className={cn(
          "font-bebas text-xl leading-none tabular-nums",
          player.seasonPoints > 0 ? "text-green-400" : "text-muted-foreground/30",
        )}
      >
        {player.seasonPoints}
      </span>
    );
  }

  function renderExpandPanel(
    player: SeasonPlayer,
    week: number,
    onClose: () => void,
  ) {
    return (
      <ConfidencePickDetailPanel
        player={player}
        week={week}
        gridData={gridData ?? null}
        isLoading={gridLoading}
        onClose={onClose}
      />
    );
  }

  const footer = isWeekGraded && weekData?.actualPassingYards != null ? (
    <TiebreakerActualsCard
      actualPassingYards={weekData.actualPassingYards}
      actualRushingYards={weekData.actualRushingYards ?? null}
      tiedPlayers={hasTie ? tiedTopPlayers : []}
    />
  ) : undefined;

  return (
    <PoolLeaderboardGrid
      players={players}
      weekColumns={weekColumns}
      currentUserId={user?.id ?? null}
      hintKey={`nfl-confidence-season-hint-${poolId}`}
      isLoading={isLoading}
      emptyMessage="No Picks Yet"
      emptySubtext="Nobody has submitted graded picks this season."
      renderWeekCell={renderWeekCell}
      renderTotal={renderTotal}
      renderExpandPanel={renderExpandPanel}
      onCellSelect={setSelectedCell}
      footer={footer}
      footnote="Points = confidence points from correct picks only · Total = season cumulative · Click a week cell to view picks"
    />
  );
}
