import { cn } from "@/lib/utils";
import { tiebreakerStatLabel, type TiebreakerSport } from "@/lib/tiebreakerLabels";
import type { TiebreakerMatchupGame } from "@/components/TiebreakerGuessDialogUi";

function parseNhlSogTiebreakerHeader(header: string): { away: string; home: string; actualLabel: string } | null {
  const m = header.match(/^([A-Za-z]{2,4})\/([A-Za-z]{2,4})\s+SOG\s+\(([^)]+)\)\s*$/i);
  if (!m) return null;
  return { away: m[1].toUpperCase(), home: m[2].toUpperCase(), actualLabel: m[3] };
}

function parseNbaPtsTiebreakerHeader(header: string): { away: string; home: string; actualLabel: string } | null {
  const m = header.match(/^([A-Za-z]{2,4})\/([A-Za-z]{2,4})\s+PTS\s+\(([^)]+)\)\s*$/i);
  if (!m) return null;
  return { away: m[1].toUpperCase(), home: m[2].toUpperCase(), actualLabel: m[3] };
}

function parseNflPassTiebreakerHeader(header: string): { away: string; home: string; actualLabel: string } | null {
  const m = header.match(/^([A-Za-z]{2,4})\/([A-Za-z]{2,4})\s+PASS\s+\(([^)]+)\)\s*$/i);
  if (!m) return null;
  return { away: m[1].toUpperCase(), home: m[2].toUpperCase(), actualLabel: m[3] };
}

function parseTiebreakerHeaderFallback(header: string): { away: string; home: string; actualLabel: string } | null {
  return (
    parseNhlSogTiebreakerHeader(header)
    ?? parseNbaPtsTiebreakerHeader(header)
    ?? parseNflPassTiebreakerHeader(header)
  );
}

function abbrevPair(
  matchup: TiebreakerMatchupGame | null | undefined,
  headerFallback?: string | null,
): { away: string; home: string } | null {
  if (matchup) {
    const away = matchup.awayTeam.abbreviation ?? matchup.awayTeam.name;
    const home = matchup.homeTeam.abbreviation ?? matchup.homeTeam.name;
    if (away && home) return { away: away.toUpperCase(), home: home.toUpperCase() };
  }
  if (headerFallback) {
    const parsed = parseTiebreakerHeaderFallback(headerFallback);
    if (parsed) return { away: parsed.away, home: parsed.home };
  }
  return null;
}

/** Compact yellow TB column for standings tables (abbreviations only — logos stay on submit dialogs). */
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
  const pair = abbrevPair(matchup, headerFallback);
  const parsed = headerFallback ? parseTiebreakerHeaderFallback(headerFallback) : null;
  const actualLabel =
    actual != null
      ? String(actual)
      : parsed?.actualLabel && parsed.actualLabel !== "TBD"
        ? parsed.actualLabel
        : null;

  return (
    <div
      className={cn(
        "text-right leading-tight text-yellow-400/90 pl-1.5 sm:pl-2 border-l border-yellow-500/20 max-w-[4.5rem] sm:max-w-[5rem]",
        className,
      )}
    >
      <span className="block text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">Tiebreaker</span>
      <span className="block text-[8px] sm:text-[9px] font-medium normal-case text-yellow-400/80 leading-snug">
        {tiebreakerStatLabel(sport)}
      </span>
      {pair && (
        <p className="mt-0.5 text-[9px] sm:text-[10px] font-semibold tracking-wide tabular-nums">
          <span className="underline decoration-yellow-400/50 underline-offset-2">{pair.away}</span>
          <span className="text-yellow-400/45 mx-0.5">/</span>
          <span className="underline decoration-yellow-400/50 underline-offset-2">{pair.home}</span>
        </p>
      )}
      <p className="text-[8px] sm:text-[9px] font-normal text-yellow-300/75 tabular-nums mt-0.5">
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
    <div className={cn("text-right tabular-nums pl-1.5 sm:pl-2 border-l border-yellow-500/20", className)}>
      <span className="font-bebas text-lg sm:text-xl leading-none text-yellow-400">
        {guess ?? "—"}
      </span>
    </div>
  );
}
