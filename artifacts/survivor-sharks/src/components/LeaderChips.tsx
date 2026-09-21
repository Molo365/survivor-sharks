import type {
  LeaderChipLeaders,
  LeaderChipSummary,
} from "@/lib/leaderChips";

interface LeaderChipsProps {
  leaders: LeaderChipLeaders;
  currentWeek: number;
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

export function LeaderChips({
  leaders,
  currentWeek,
  liveGamesInProgress,
  onSelect,
}: LeaderChipsProps) {
  return (
    <div className="flex w-full gap-2">
      <button
        type="button"
        className="min-w-0 flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        aria-label={`Week ${currentWeek} leader: ${leaderValue(leaders.week)}`}
      >
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {liveGamesInProgress > 0 && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400" aria-hidden="true" />
          )}
          WEEK {currentWeek} LEADER
        </span>
        <span className="flex min-w-0 items-baseline gap-1 truncate font-bebas text-lg leading-tight text-foreground">
          <LeaderValue leader={leaders.week} />
        </span>
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        aria-label={`Season leader: ${leaderValue(leaders.season)}`}
      >
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {liveGamesInProgress > 0 && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400" aria-hidden="true" />
          )}
          SEASON LEADER
        </span>
        <span className="flex min-w-0 items-baseline gap-1 truncate font-bebas text-lg leading-tight text-foreground">
          <LeaderValue leader={leaders.season} />
        </span>
      </button>
    </div>
  );
}