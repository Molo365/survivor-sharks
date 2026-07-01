interface TiedPlayer {
  userId: number;
  username: string;
  displayName: string | null;
  tiebreakerPassingYardsGuess: number | null;
  tiebreakerRushingYardsGuess: number | null;
  tiebreakerDiff1: number | null;
  tiebreakerDiff2: number | null;
}

interface TiebreakerActualsCardProps {
  actualPassingYards: number | null;
  actualRushingYards: number | null;
  tiedPlayers: TiedPlayer[];
  tb1Label?: string;
  tb2Label?: string;
  abbrLabel1?: string;
  abbrLabel2?: string;
}

export function TiebreakerActualsCard({
  actualPassingYards,
  actualRushingYards,
  tiedPlayers,
  tb1Label = "Combined passing yards",
  tb2Label = "Combined rushing yards",
  abbrLabel1 = "Pass",
  abbrLabel2 = "Rush",
}: TiebreakerActualsCardProps) {
  const hasPlayers = tiedPlayers.length >= 1;
  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">Tiebreaker Actuals</p>
      <div className="flex gap-6">
        <div>
          <p className="text-[10px] text-muted-foreground/60">{tb1Label}</p>
          <p className="font-bebas text-xl text-yellow-300">{actualPassingYards ?? "—"}</p>
        </div>
        {actualRushingYards != null && (
          <div>
            <p className="text-[10px] text-muted-foreground/60">{tb2Label}</p>
            <p className="font-bebas text-xl text-yellow-300">{actualRushingYards}</p>
          </div>
        )}
      </div>

      {hasPlayers && (
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
                <span className="text-muted-foreground/40">{abbrLabel1} </span>
                <span className="text-foreground/80">{p.tiebreakerPassingYardsGuess ?? "—"}</span>
                {p.tiebreakerDiff1 != null && (
                  <span className="text-yellow-400/70"> (Δ{p.tiebreakerDiff1})</span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground/60 shrink-0">
                <span className="text-muted-foreground/40">{abbrLabel2} </span>
                <span className="text-foreground/80">{p.tiebreakerRushingYardsGuess ?? "—"}</span>
                {p.tiebreakerDiff2 != null && (
                  <span className="text-yellow-400/70"> (Δ{p.tiebreakerDiff2})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
