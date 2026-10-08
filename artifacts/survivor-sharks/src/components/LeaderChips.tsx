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

function leftChipLabel(left: LeaderChipLeftDisplay): string {
  if (left.mode === "previous-week") {
    return `WEEK ${left.weekNumber} WINNER`;
  }
  return `WEEK ${left.weekNumber} LEADER`;
}

function leftChipAria(left: LeaderChipLeftDisplay): string {
  if (left.mode === "previous-week") {
    return `Week ${left.weekNumber} winner`;
  }
  if (left.mode === "upcoming") {
    return `Week ${left.weekNumber} leader — updates Sunday evening during the main slate`;
  }
  return `Week ${left.weekNumber} leader`;
}

const UPCOMING_LEADER_HINT =
  "Weekly leader updates Sunday evening (ET) once the main slate is underway.";

export function LeaderChips({
  left,
  seasonLeader,
  liveGamesInProgress,
  onSelect,
}: LeaderChipsProps) {
  const showLivePulse = left.mode === "current-week" && liveGamesInProgress > 0;
  const leftTitle = left.mode === "upcoming" ? UPCOMING_LEADER_HINT : undefined;

  return (
    <div className="flex w-full gap-2">
      <button
        type="button"
        className="min-w-0 flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        title={leftTitle}
        aria-label={`${leftChipAria(left)}: ${leaderValue(left.leader)}`}
      >
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {showLivePulse && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400" aria-hidden="true" />
          )}
          {leftChipLabel(left)}
          {left.mode === "upcoming" && (
            <span className="hidden font-sans font-semibold normal-case tracking-normal text-muted-foreground/70 sm:inline">
              · Sun eve
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-baseline gap-1 truncate font-bebas text-lg leading-tight text-foreground">
          {left.leader ? (
            <LeaderValue leader={left.leader} />
          ) : (
            <span className="text-muted-foreground/80">—</span>
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
