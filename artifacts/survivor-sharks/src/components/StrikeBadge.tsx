import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type StrikeBadgeProps = {
  strikeCount: number;
  maxLives: number;
  className?: string;
  size?: "sm" | "md";
};

/** Graded losses in multi-life survivor pools (matches grid loss cells). */
export function StrikeBadge({
  strikeCount,
  maxLives,
  className,
  size = "md",
}: StrikeBadgeProps) {
  if (maxLives <= 1 || strikeCount <= 0) return null;

  const label = strikeCount === 1 ? "1 Strike" : `${strikeCount} Strikes`;
  const title =
    strikeCount >= maxLives
      ? `${maxLives} losses — no lives remaining`
      : strikeCount >= maxLives - 1
        ? "Final warning — one more loss eliminates this player"
        : `${strikeCount} of ${maxLives} losses`;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded border bg-amber-500/10 font-bold uppercase tracking-wider text-amber-400 border-amber-500/30",
        size === "sm" ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-[11px]",
        className,
      )}
    >
      <Zap className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {label}
    </span>
  );
}
