import { cn } from "@/lib/utils";
import { tiebreakerStatLabel, type TiebreakerSport } from "@/lib/tiebreakerLabels";
import {
  TiebreakerMatchupLogoStrip,
  type TiebreakerMatchupGame,
} from "@/components/TiebreakerGuessDialogUi";

function parseNhlSogTiebreakerHeader(header: string): { away: string; home: string; actualLabel: string } | null {
  const m = header.match(/^([A-Za-z]{2,4})\/([A-Za-z]{2,4})\s+SOG\s+\(([^)]+)\)\s*$/i);
  if (!m) return null;
  return { away: m[1].toUpperCase(), home: m[2].toUpperCase(), actualLabel: m[3] };
}

function matchupFromHeader(header: string): TiebreakerMatchupGame | null {
  const parsed = parseNhlSogTiebreakerHeader(header);
  if (!parsed) return null;
  return {
    awayTeam: { name: parsed.away, abbreviation: parsed.away },
    homeTeam: { name: parsed.home, abbreviation: parsed.home },
  };
}

export function TiebreakerStandingsColumnHeader({
  sport = "nhl",
  matchup,
  headerFallback,
  actual,
  className,
}: {
  sport?: TiebreakerSport;
  matchup?: TiebreakerMatchupGame | null;
  headerFallback?: string | null;
  actual?: number | null;
  className?: string;
}) {
  const game = matchup ?? (headerFallback ? matchupFromHeader(headerFallback) : null);
  const parsed = headerFallback ? parseNhlSogTiebreakerHeader(headerFallback) : null;
  const actualLabel =
    actual != null
      ? String(actual)
      : parsed?.actualLabel && parsed.actualLabel !== "TBD"
        ? parsed.actualLabel
        : null;

  return (
    <div
      className={cn(
        "text-right leading-tight text-yellow-400/90 pl-2 sm:pl-3 border-l border-yellow-500/20 space-y-1.5 min-w-[5.5rem]",
        className,
      )}
    >
      <div>
        <span className="block text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">Tiebreaker</span>
        <span className="block text-[8px] sm:text-[9px] font-medium normal-case text-yellow-400/80">
          {tiebreakerStatLabel(sport)}
        </span>
      </div>
      {game && (
        <TiebreakerMatchupLogoStrip game={game} tone="yellow" size="sm" className="justify-end" />
      )}
      <p className="text-[8px] sm:text-[9px] font-normal text-yellow-300/75 tabular-nums">
        Actual {actualLabel ?? "TBD"}
      </p>
    </div>
  );
}

export function TiebreakerStandingsColumnGuess({
  guess,
  className,
}: {
  guess: number | null | undefined;
  className?: string;
}) {
  return (
    <div className={cn("text-right tabular-nums pl-2 sm:pl-3 border-l border-yellow-500/20", className)}>
      <span className="font-bebas text-lg sm:text-xl leading-none text-yellow-400">
        {guess ?? "—"}
      </span>
    </div>
  );
}
