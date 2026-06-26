import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { TiebreakerActualsCard } from "@/components/TiebreakerActualsCard";
import {
  PoolLeaderboardGrid,
  type WeekCellDescriptor,
  type LeaderboardPlayer,
} from "@/components/PoolLeaderboardGrid";
import {
  useGetNflPickEmSeasonWeekResults,
  getGetNflPickEmSeasonWeekResultsQueryKey,
} from "@workspace/api-client-react";
import type {
  NflPickEmSeasonLeaderboardEntry,
  NflPickEmSeasonWeekResults,
  NflPickEmSeasonGame,
  NflPickEmSeasonPlayerPick,
} from "@workspace/api-client-react";

// ── PickEm player shape (must satisfy LeaderboardPlayer) ─────────────────────

type PickEmPlayer = NflPickEmSeasonLeaderboardEntry & LeaderboardPlayer;

// ── Pick card (no confidence badge, just team + matchup + W/L) ────────────────

function PickCard({
  game,
  pick,
}: {
  game?: NflPickEmSeasonGame | null;
  pick: NflPickEmSeasonPlayerPick;
}) {
  const isCorrect = pick.result === "correct";
  const isIncorrect = pick.result === "incorrect";

  const pickedTeam = game
    ? pick.pickedTeamId === game.awayTeam.id
      ? game.awayTeam
      : game.homeTeam
    : null;

  const logoUrl = pickedTeam?.logoUrl ?? null;
  const teamName = pickedTeam?.name ?? pick.pickedTeamName;
  const abbr =
    pickedTeam?.abbreviation ??
    pick.pickedTeamName.slice(0, 3).toUpperCase();
  const matchup = game
    ? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
    : null;

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
      {logoUrl ? (
        <div className="shrink-0 w-7 h-7 rounded-full bg-white/90 p-0.5 flex items-center justify-center">
          <img
            src={logoUrl}
            alt={abbr}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center">
          <span className="text-[9px] font-bold uppercase">{abbr}</span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {teamName}
        </p>
        {matchup && (
          <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
            {matchup}
          </p>
        )}
      </div>

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
        {isCorrect ? "✓" : isIncorrect ? "✗" : "–"}
      </span>
    </div>
  );
}

// ── Pick detail expand panel ──────────────────────────────────────────────────

function PickEmExpandPanel({
  player,
  week,
  weekData,
  isLoading,
  onClose,
}: {
  player: PickEmPlayer;
  week: number;
  weekData: NflPickEmSeasonWeekResults | undefined;
  isLoading: boolean;
  onClose: () => void;
}) {
  const playerName = player.displayName ?? player.username;

  const content = useMemo(() => {
    if (!weekData) return null;
    const p = weekData.players.find((p) => p.userId === player.userId);
    if (!p || p.picks.length === 0) return [];

    const pickMap = new Map<string, NflPickEmSeasonPlayerPick>(
      p.picks.map((pk) => [pk.gameId, pk]),
    );
    const joined = weekData.games
      .map((g) => ({
        game: g as NflPickEmSeasonGame | null,
        pick: pickMap.get(g.id) ?? null,
      }))
      .filter(({ pick }) => pick !== null) as {
      game: NflPickEmSeasonGame | null;
      pick: NflPickEmSeasonPlayerPick;
    }[];

    // Fallback: if game-join is empty (ESPN ID mismatch) render picks without game context
    if (joined.length === 0) {
      return p.picks.map((pick) => ({
        game: null as NflPickEmSeasonGame | null,
        pick,
      }));
    }
    return joined;
  }, [weekData, player.userId]);

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

      {isLoading || !weekData ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
          <span className="text-sm text-muted-foreground/40">
            Loading picks…
          </span>
        </div>
      ) : content && content.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {content.map(({ game, pick }) => (
            <PickCard key={pick.gameId} game={game} pick={pick} />
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

interface PickEmSeasonLeaderboardProps {
  poolId: number;
  entries: NflPickEmSeasonLeaderboardEntry[];
  currentWeek: number;
  currentUserId: number | null;
  actualPassingYards: number | null;
  actualRushingYards: number | null;
  isLoading: boolean;
}

export function PickEmSeasonLeaderboard({
  poolId,
  entries,
  currentWeek,
  currentUserId,
  actualPassingYards,
  actualRushingYards,
  isLoading,
}: PickEmSeasonLeaderboardProps) {
  const [selectedCell, setSelectedCell] = useState<{
    userId: number;
    week: number;
  } | null>(null);

  const weekResultsParams = useMemo(
    () => (selectedCell ? { week: selectedCell.week } : undefined),
    [selectedCell],
  );

  const { data: weekData, isLoading: weekLoading } =
    useGetNflPickEmSeasonWeekResults(poolId, weekResultsParams, {
      query: {
        queryKey: getGetNflPickEmSeasonWeekResultsQueryKey(
          poolId,
          weekResultsParams,
        ),
        enabled: !!selectedCell,
        staleTime: 5 * 60 * 1000,
      },
    });

  // Week columns: union of all weeks where any player has data
  const weekColumns = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      for (const w of Object.keys(e.weeklyScores ?? {})) {
        set.add(Number(w));
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [entries]);

  // ── Render props ──────────────────────────────────────────────────────────

  function renderWeekCell(
    player: PickEmPlayer,
    wk: number,
  ): WeekCellDescriptor {
    const ws = player.weeklyScores?.[String(wk)] as
      | { correct: number; total: number }
      | undefined;

    if (!ws) {
      return {
        clickable: false,
        tooltip: `${player.displayName ?? player.username} — Wk${wk}: no picks`,
        content: <span className="text-muted-foreground/25 text-xs">—</span>,
      };
    }

    const pct = ws.total > 0 ? Math.round((ws.correct / ws.total) * 100) : null;

    return {
      clickable: true,
      tooltip: `${player.displayName ?? player.username} — Wk${wk}: ${ws.correct}/${ws.total}`,
      content: (
        <div className="flex flex-col items-center min-w-[38px] mx-auto">
          <span
            className={cn(
              "font-bebas text-base leading-none tabular-nums",
              pct !== null && pct >= 60
                ? "text-green-400"
                : pct !== null && pct < 40
                  ? "text-red-400/70"
                  : "text-foreground/80",
            )}
          >
            {ws.correct}
          </span>
          <span className="text-[8px] text-muted-foreground/50 leading-none">
            /{ws.total}
          </span>
        </div>
      ),
    };
  }

  function renderTotal(player: PickEmPlayer) {
    const pct =
      player.seasonTotal > 0
        ? Math.round((player.seasonCorrect / player.seasonTotal) * 100)
        : null;
    return (
      <div className="text-right">
        <span
          className={cn(
            "font-bebas text-xl leading-none tabular-nums",
            player.seasonCorrect > 0 ? "text-green-400" : "text-muted-foreground/30",
          )}
        >
          {player.seasonCorrect}
        </span>
        <span className="font-bebas text-sm text-muted-foreground/40 leading-none">
          /{player.seasonTotal}
        </span>
        {pct !== null && (
          <div className="text-[10px] text-muted-foreground/50 leading-none">
            {pct}%
          </div>
        )}
        {player.potSplit && (
          <div className="text-[9px] font-bold uppercase tracking-wide text-yellow-400/80 leading-none mt-0.5">
            Split
          </div>
        )}
      </div>
    );
  }

  function renderExpandPanel(
    player: PickEmPlayer,
    week: number,
    onClose: () => void,
  ) {
    return (
      <PickEmExpandPanel
        player={player}
        week={week}
        weekData={weekData}
        isLoading={weekLoading}
        onClose={onClose}
      />
    );
  }

  // Show tiebreaker actuals card when Week 18 results are known
  const tbActualsKnown = actualPassingYards != null && actualRushingYards != null;
  // Candidates: rank-1 players who submitted tiebreaker guesses
  const tbCandidates = entries.filter(
    (e) => e.rank === 1 && (e.tiebreakerPassingYards != null || e.tiebreakerRushingYards != null),
  );
  const footer = tbActualsKnown && tbCandidates.length > 0 ? (
    <TiebreakerActualsCard
      actualPassingYards={actualPassingYards!}
      actualRushingYards={actualRushingYards}
      tiedPlayers={tbCandidates.map((e) => ({
        userId: e.userId,
        username: e.username,
        displayName: e.displayName ?? null,
        tiebreakerPassingYardsGuess: e.tiebreakerPassingYards ?? null,
        tiebreakerRushingYardsGuess: e.tiebreakerRushingYards ?? null,
        tiebreakerDiff1: e.tiebreakerDiff1 ?? null,
        tiebreakerDiff2: e.tiebreakerDiff2 ?? null,
      }))}
    />
  ) : undefined;

  return (
    <PoolLeaderboardGrid
      players={entries as PickEmPlayer[]}
      weekColumns={weekColumns}
      currentUserId={currentUserId}
      hintKey={`pickem-season-leaderboard-hint-${poolId}`}
      isLoading={isLoading}
      emptyMessage="No Picks Yet"
      emptySubtext="Make picks to appear on the leaderboard."
      renderWeekCell={renderWeekCell}
      renderTotal={renderTotal}
      renderExpandPanel={renderExpandPanel}
      onCellSelect={setSelectedCell}
      footer={footer}
      footnote="Correct/Total picks per week · Total = season cumulative · Click a week cell to view picks"
    />
  );
}
