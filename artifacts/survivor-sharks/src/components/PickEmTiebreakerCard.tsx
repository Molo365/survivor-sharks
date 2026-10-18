import { tiebreakerStatLabel } from "@/lib/tiebreakerLabels";

interface TiedPickEmPlayer {
  userId: number;
  username: string;
  displayName: string | null;
  tiebreakerRunsGuess?: number | null;
  tiebreakerRunsDiff?: number | null;
  tiebreakerShotsOnGoalGuess?: number | null;
  tiebreakerNhlDiff?: number | null;
}

interface PickEmTiebreakerCardProps {
  sport?: "mlb" | "nhl";
  actualRuns?: number | null;
  actualShotsOnGoal?: number | null;
  tiedPlayers: TiedPickEmPlayer[];
}

export function PickEmTiebreakerCard({
  sport = "mlb",
  actualRuns,
  actualShotsOnGoal,
  tiedPlayers,
}: PickEmTiebreakerCardProps) {
  const showGuesses = tiedPlayers.length > 0;
  const isNhl = sport === "nhl";
  const statLabel = tiebreakerStatLabel(isNhl ? "nhl" : "mlb");
  const actual = isNhl ? actualShotsOnGoal : actualRuns;

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-1">Tiebreaker</p>
      <p className="text-[10px] text-muted-foreground/50 mb-2">
        One guess on the last game of the week — closest to the actual {statLabel.toLowerCase()} wins.
        Equally close splits the prize.
      </p>

      <div>
        <p className="text-[10px] text-muted-foreground/60">{statLabel} (tiebreaker game)</p>
        <p className="font-bebas text-xl text-yellow-300">{actual ?? "—"}</p>
        {actual == null && (
          <p className="text-[10px] text-muted-foreground/45 mt-1">Updates once the tiebreaker game is final.</p>
        )}
      </div>

      {showGuesses && (
        <div className="pt-2 border-t border-yellow-500/20 space-y-1.5 mt-2">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold pb-0.5">
            {tiedPlayers.length >= 2 ? "Tiebreaker guesses" : "Your tiebreaker guess"}
          </p>
          {tiedPlayers.map((p) => {
            const guess = isNhl ? p.tiebreakerShotsOnGoalGuess : p.tiebreakerRunsGuess;
            const diff = isNhl ? p.tiebreakerNhlDiff : p.tiebreakerRunsDiff;
            return (
              <div key={p.userId} className="flex items-center gap-3 text-xs">
                <span className="flex-1 truncate font-medium text-foreground/80">
                  {p.displayName ?? p.username}
                </span>
                <span className="tabular-nums text-muted-foreground/60 shrink-0">
                  <span className="text-foreground/80">{guess ?? "—"}</span>
                  {diff != null && (
                    <span className="text-yellow-400/70"> (off by {diff})</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
