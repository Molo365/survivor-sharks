interface TiedPickEmPlayer {
  userId: number;
  username: string;
  displayName: string | null;
  tiebreakerRunsGuess: number | null;
  tiebreakerStrikeoutsGuess: number | null;
  tiebreakerRunsDiff: number | null;
}

interface PickEmTiebreakerCardProps {
  actualRuns: number | null;
  actualStrikeouts: number | null;
  tiedPlayers: TiedPickEmPlayer[];
}

export function PickEmTiebreakerCard({ actualRuns, actualStrikeouts, tiedPlayers }: PickEmTiebreakerCardProps) {
  const hasTie = tiedPlayers.length >= 2;

  const strikeoutDiff = (guess: number | null) =>
    actualStrikeouts != null && guess != null
      ? Math.abs(guess - actualStrikeouts)
      : null;

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">Tiebreaker</p>
      <div className="flex gap-6">
        <div>
          <p className="text-[10px] text-muted-foreground/60">Combined runs scored</p>
          <p className="font-bebas text-xl text-yellow-300">{actualRuns ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60">Total strikeouts</p>
          <p className="font-bebas text-xl text-yellow-300">{actualStrikeouts ?? "—"}</p>
        </div>
      </div>

      {hasTie && (
        <div className="pt-2 border-t border-yellow-500/20 space-y-1.5 mt-2">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold pb-0.5">
            Tied players — tiebreaker guesses
          </p>
          {tiedPlayers.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 text-xs">
              <span className="flex-1 truncate font-medium text-foreground/80">
                {p.displayName ?? p.username}
              </span>
              <span className="tabular-nums text-muted-foreground/60 shrink-0">
                <span className="text-muted-foreground/40">Runs </span>
                <span className="text-foreground/80">{p.tiebreakerRunsGuess ?? "—"}</span>
                {p.tiebreakerRunsDiff != null && (
                  <span className="text-yellow-400/70"> (Δ{p.tiebreakerRunsDiff})</span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground/60 shrink-0">
                <span className="text-muted-foreground/40">K </span>
                <span className="text-foreground/80">{p.tiebreakerStrikeoutsGuess ?? "—"}</span>
                {strikeoutDiff(p.tiebreakerStrikeoutsGuess) != null && (
                  <span className="text-yellow-400/70"> (Δ{strikeoutDiff(p.tiebreakerStrikeoutsGuess)})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
