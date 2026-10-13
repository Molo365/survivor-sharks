import { cn } from "@/lib/utils";
import {
  WEEKLY_BONUS_RESERVE_WEEKS,
  buildWeeklyBonusScenarios,
  weeklyPayoutFromPercent,
} from "@/lib/weeklyBonusWizard";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function NflWeeklyBonusPercentPreview({
  entryFee,
  weeklyPercent,
  className,
}: {
  entryFee: number;
  weeklyPercent: number;
  className?: string;
}) {
  if (entryFee <= 0 || weeklyPercent <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Enter entry fee and weekly payout percent to see threshold and season-pot examples.
      </p>
    );
  }

  const weeklyPerWeek = weeklyPayoutFromPercent(entryFee, weeklyPercent);
  const { minPlayers, scenarios } = buildWeeklyBonusScenarios({
    entryFee,
    weeklyPercent,
    examplePlayerCount: 57,
  });

  return (
    <div className={cn("space-y-3", className)} data-testid="weekly-bonus-preview">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Weekly bonus preview
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">{weeklyPercent}%</span> of{" "}
        <span className="font-semibold text-foreground">{fmt(entryFee)}</span> entry ={" "}
        <span className="font-semibold text-foreground">{fmt(weeklyPerWeek)}</span> per week winner
        (rounded to nearest $5). Unlimited entries — more players grow the season slice, not the weekly amount.
      </p>
      <div className="rounded-md bg-muted/30 border border-border/40 px-3 py-2 text-sm flex justify-between gap-4">
        <span className="text-muted-foreground">Minimum players for weekly payouts</span>
        <span className="font-semibold text-foreground">{minPlayers}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/90">
        Needs at least {minPlayers} players so {WEEKLY_BONUS_RESERVE_WEEKS} weeks × {fmt(weeklyPerWeek)} can be covered from entry fees (same idea as office pools).
      </p>
      <div className="space-y-2">
        {scenarios.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 space-y-1.5 text-sm"
          >
            <div className="font-medium text-foreground">{s.label}</div>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-muted-foreground">Money in</span>
              <span className="tabular-nums">{fmt(s.collected)}</span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-muted-foreground">Weekly bonuses</span>
              <span className="tabular-nums">
                {s.weeklyEnabled
                  ? `Up to ${fmt(s.maxWeeklySeasonCost)} / season (${fmt(s.weeklyPerWeek)}/wk)`
                  : "Off (threshold not met)"}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-xs border-t border-border/30 pt-1.5">
              <span className="text-muted-foreground">Guidance left for season prizes</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  s.seasonPotGuidance < 0 ? "text-destructive" : "text-green-400",
                )}
              >
                {fmt(s.seasonPotGuidance)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Guidance only — season % prizes and commissioner cut are set on the next steps. Below threshold, weekly stays off and entries fund season only.
      </p>
    </div>
  );
}
