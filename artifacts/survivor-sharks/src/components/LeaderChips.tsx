import type {
  LeaderChipLeftDisplay,
  LeaderChipSummary,
} from "@/lib/leaderChips";

interface LeaderChipsProps {
  left: LeaderChipLeftDisplay;
  seasonLeader: LeaderChipSummary | null;
  liveGamesInProgress: number;
  onSelect: () => void;
}

function leaderValue(leader: LeaderChipSummary | null): string {
  if (!leader) return "—";
  const name = leader.names.length >= 2
    ? `${leader.names.length} tied`
    : leader.names[0];
  return `${name} · ${leader.points} pts${leader.live > 0 ? `, +${leader.live} live` : ""}`;
}

function LeaderValue({ leader }: { leader: LeaderChipSummary | null }) {
  if (!leader) return <>—</>;
  const name = leader.names.length >= 2
    ? `${leader.names.length} tied`
    : leader.names[0];

  return (
    <>
      <span className="truncate">
        {name} · {leader.points} pts
      </span>
      {leader.live > 0 && (
        <span className="shrink-0 font-sans text-xs font-semibold text-green-400">
          +{leader.live} live
        </span>
      )}
    </>
  );
}

function leftChipLabel(left: LeaderChipLeftDisplay, liveGamesInProgress: number): string {
  if (left.mode === "previous-week") {
    return `WEEK ${left.weekNumber} WINNER`;
  }
  if (left.mode === "current-week") {
    return `WEEK ${left.weekNumber} LEADER`;
  }
  return `WEEK ${left.weekNumber}`;
}

function leftChipAria(left: LeaderChipLeftDisplay): string {
  if (left.mode === "previous-week") {
    return `Week ${left.weekNumber} winner`;
  }
  if (left.mode === "current-week") {
    return `Week ${left.weekNumber} leader`;
  }
  return `Week ${left.weekNumber} picks in progress`;
}

export function LeaderChips({
  left,
  seasonLeader,
  liveGamesInProgress,
  onSelect,
}: LeaderChipsProps) {
  const showLivePulse = left.mode === "current-week" && liveGamesInProgress > 0;
  const leftPlaceholder = left.mode === "upcoming"
    ? "Leaderboard updates Sun evening"
    : null;

  return (
    <div className="flex w-full gap-2">
      <button
        type="button"
        className="min-w-0 flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        aria-label={`${leftChipAria(left)}: ${leaderValue(left.leader)}`}
      >
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {showLivePulse && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400" aria-hidden="true" />
          )}
          {leftChipLabel(left, liveGamesInProgress)}
        </span>
        <span className="flex min-w-0 items-baseline gap-1 truncate font-bebas text-lg leading-tight text-foreground">
          {left.leader ? (
            <LeaderValue leader={left.leader} />
          ) : (
            <span className="truncate text-base text-muted-foreground/80">
              {leftPlaceholder ?? "—"}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        aria-label={`Season leader: ${leaderValue(seasonLeader)}`}
      >
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {liveGamesInProgress > 0 && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400" aria-hidden="true" />
          )}
          SEASON LEADER
        </span>
        <span className="flex min-w-0 items-baseline gap-1 truncate font-bebas text-lg leading-tight text-foreground">
          <LeaderValue leader={seasonLeader} />
        </span>
      </button>
    </div>
  );
}
