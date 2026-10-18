import { cn } from "@/lib/utils";

function parseNhlSogTiebreakerHeader(header: string): { away: string; home: string; actualLabel: string } | null {
  const m = header.match(/^([A-Za-z]{2,4})\/([A-Za-z]{2,4})\s+SOG\s+\(([^)]+)\)\s*$/i);
  if (!m) return null;
  return { away: m[1].toUpperCase(), home: m[2].toUpperCase(), actualLabel: m[3] };
}

export function NhlSogTiebreakerHeader({
  header,
  actualShotsOnGoal,
  className,
}: {
  header: string;
  actualShotsOnGoal?: number | null;
  className?: string;
}) {
  const parsed = parseNhlSogTiebreakerHeader(header);
  const actual =
    actualShotsOnGoal != null
      ? String(actualShotsOnGoal)
      : parsed?.actualLabel && parsed.actualLabel !== "TBD"
        ? parsed.actualLabel
        : null;

  return (
    <div className={cn("text-right leading-tight text-yellow-400/90 pl-2 sm:pl-3 border-l border-yellow-500/20", className)}>
      <span className="block text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">Tiebreaker</span>
      <span className="block text-[8px] sm:text-[9px] font-medium normal-case text-yellow-400/80">Shots on goal</span>
      {parsed ? (
        <p className="mt-1 text-[9px] sm:text-[10px] font-semibold tracking-wide">
          <span className="underline decoration-yellow-400/50 underline-offset-2">{parsed.away}</span>
          <span className="text-yellow-400/45 mx-0.5">/</span>
          <span className="underline decoration-yellow-400/50 underline-offset-2">{parsed.home}</span>
          {actual != null ? (
            <span className="block text-[8px] sm:text-[9px] font-normal text-yellow-300/75 mt-0.5 tabular-nums">
              Actual {actual}
            </span>
          ) : (
            <span className="block text-[8px] text-yellow-400/45 mt-0.5">Actual TBD</span>
          )}
        </p>
      ) : (
        <p className="mt-0.5 text-[8px] sm:text-[9px] normal-case truncate" title={header}>{header}</p>
      )}
    </div>
  );
}

export function NhlSogTiebreakerGuess({
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
