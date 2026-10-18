import { tiebreakerStatLabel, type TiebreakerSport } from "@/lib/tiebreakerLabels";
import {
  TiebreakerMatchupLogoStrip,
  type TiebreakerMatchupGame,
} from "@/components/TiebreakerGuessDialogUi";

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
  matchup?: TiebreakerMatchupGame | null;
  tiedPlayers: TiedPickEmPlayer[];
}

export function PickEmTiebreakerCard({
  sport = "mlb",
  actualRuns,
  actualShotsOnGoal,
  matchup,
  tiedPlayers,
}: PickEmTiebreakerCardProps) {
  const showGuesses = tiedPlayers.length > 0;
  const tbSport: TiebreakerSport = sport === "nhl" ? "nhl" : "mlb";
  const statLabel = tiebreakerStatLabel(tbSport);
  const actual = sport === "nhl" ? actualShotsOnGoal : actualRuns;

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-1">Tiebreaker</p>
        <p className="text-[10px] text-muted-foreground/50">
          One guess on the last game of the week — closest to actual {statLabel.toLowerCase()} wins.
          Equally close splits the prize.
        </p>
      </div>

      {matchup && <TiebreakerMatchupLogoStrip game={matchup} tone="yellow" />}

      <div>
        <p className="text-[10px] text-muted-foreground/60">{statLabel} (actual)</p>
        <p className="font-bebas text-xl text-yellow-300">{actual ?? "—"}</p>
        {actual == null && (
          <p className="text-[10px] text-muted-foreground/45 mt-1">Updates once the tiebreaker game is final.</p>
        )}
      </div>

      {showGuesses && (
        <div className="pt-2 border-t border-yellow-500/20 space-y-1.5">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold pb-0.5">
            {tiedPlayers.length >= 2 ? "Tiebreaker guesses" : "Your tiebreaker guess"}
          </p>
          {tiedPlayers.map((p) => {
            const guess = sport === "nhl" ? p.tiebreakerShotsOnGoalGuess : p.tiebreakerRunsGuess;
            const diff = sport === "nhl" ? p.tiebreakerNhlDiff : p.tiebreakerRunsDiff;
            return (
              <div key={p.userId} className="flex items-center gap-3 text-xs">
                <span className="flex-1 truncate font-medium text-foreground/80">
                  {p.displayName ?? p.username}
                </span>
                <span className="tabular-nums text-yellow-400/90 shrink-0 font-bebas text-base">
                  {guess ?? "—"}
                  {diff != null && (
                    <span className="text-[10px] font-sans text-yellow-400/60 ml-1">(off by {diff})</span>
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
