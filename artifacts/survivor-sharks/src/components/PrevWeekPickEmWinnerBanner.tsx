import { Trophy } from "lucide-react";
import type { PickEmLeaderboardEntry } from "@workspace/api-client-react";

export type PrevWeekWinnerGroup = {
  entries: PickEmLeaderboardEntry[];
  correct: number;
  picked: number;
  prizeWon: number | null;
};

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function winnerNames(groups: PrevWeekWinnerGroup[]): string {
  if (groups.length === 1) {
    return groups[0].entries.map((e) => e.displayName || e.username).join(" & ");
  }
  return groups
    .map((group) => group.entries.map((e) => e.displayName || e.username).join(" & "))
    .join(" · ");
}

function prizeSummary(groups: PrevWeekWinnerGroup[]): string | null {
  const withPrize = groups.filter((g) => g.prizeWon != null);
  if (withPrize.length === 0) return null;
  if (withPrize.length === 1) {
    const g = withPrize[0];
    const suffix = g.entries.length > 1 ? " each" : "";
    return `$${g.prizeWon}${suffix}`;
  }
  return withPrize.map((g) => `$${g.prizeWon}`).join(" · ");
}

/** Last-period winner strip for weekly Pick'em (matches NFL Confidence weekly hierarchy). */
export function PrevWeekPickEmWinnerBanner({
  groups,
  weekStart,
  weekEnd,
  periodLabel,
  onViewResults,
}: {
  groups: PrevWeekWinnerGroup[];
  weekStart: string;
  weekEnd: string;
  periodLabel?: string | null;
  onViewResults: () => void;
}) {
  if (groups.length === 0) return null;

  const dateRange = formatWeekRange(weekStart, weekEnd);
  const titleBase = periodLabel
    ? groups.length > 1
      ? "Last matchday leaders"
      : "Last matchday leader"
    : groups.length > 1
      ? "Last Week's Winners"
      : "Last Week's Winner";

  const eyebrow = periodLabel
    ? `🏆 ${titleBase} · ${periodLabel}`
  : `🏆 ${titleBase} · ${dateRange}`;

  const names = winnerNames(groups);
  const singleGroup = groups.length === 1;
  const primary = groups[0];
  const scoreLabel = singleGroup ? `${primary.correct}/${primary.picked}` : null;
  const prize = prizeSummary(groups);
  const subtitleParts = [
    singleGroup ? `${primary.correct}/${primary.picked} correct` : null,
    prize,
    !periodLabel ? null : dateRange,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 to-amber-600/5 px-4 py-3.5 flex items-center gap-3">
      <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-0.5 truncate">
          {eyebrow}
        </p>
        <p className="font-bebas text-xl sm:text-2xl tracking-wide leading-tight text-foreground truncate">
          {names}
        </p>
        {subtitleParts.length > 0 && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
            {subtitleParts.join(" · ")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onViewResults}
        className="text-right shrink-0 rounded-lg px-2 py-1 -mr-1 hover:bg-yellow-500/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/40"
        aria-label="View full results for last period"
      >
        {scoreLabel ? (
          <>
            <p className="font-bebas text-2xl text-yellow-400 leading-none underline decoration-yellow-500/40 underline-offset-4">
              {scoreLabel}
            </p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">correct · tap</p>
          </>
        ) : (
          <p className="text-xs font-medium text-yellow-400/90 leading-snug max-w-[5.5rem]">
            View full results →
          </p>
        )}
      </button>
    </div>
  );
}