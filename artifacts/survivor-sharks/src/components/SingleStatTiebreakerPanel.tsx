import { Input } from "@/components/ui/input";
import { tiebreakerHelpLine, tiebreakerStatLabel, type TiebreakerSport } from "@/lib/tiebreakerLabels";

function formatGameTimeEt(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

type TiebreakerGameInfo = {
  awayTeam: { name: string };
  homeTeam: { name: string };
  startTime: string;
};

type Props = {
  sport: TiebreakerSport;
  context: "weekly" | "slate" | "season";
  title?: string;
  game: TiebreakerGameInfo | null;
  value: string;
  onChange: (value: string) => void;
  weekNumber?: number;
};

/** Inline yellow tiebreaker block (same pattern as NFL spreads weekly bonus). */
export function SingleStatTiebreakerPanel({
  sport,
  context,
  title = "Tiebreaker",
  game,
  value,
  onChange,
  weekNumber,
}: Props) {
  const label = tiebreakerStatLabel(sport);
  const help = tiebreakerHelpLine(sport, context);

  return (
    <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/5 p-4 space-y-3">
      <div>
        <p className="font-bebas text-lg tracking-wide text-yellow-300">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {weekNumber != null ? help.replace("this week", `Week ${weekNumber}`) : help}
        </p>
      </div>
      {game && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-yellow-500/20 bg-background/30 px-3 py-2">
          <span className="text-sm font-semibold text-foreground">
            {game.awayTeam.name} @ {game.homeTeam.name}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatGameTimeEt(game.startTime)}
          </span>
        </div>
      )}
      <Input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}
