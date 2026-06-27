import { Trophy } from "lucide-react";
import { calculatePayouts, scaledPrizePot, ORDINALS } from "@/lib/calculatePayouts";

interface PrizeDisplayProps {
  prizeStructure?: Array<{ place: number; amount: number }> | null;
  prizePot?: number | null;
  maxEntries?: number | null;
  actualEntries?: number | null;
  variant: "pool-home" | "join-invite" | "pool-card" | "leaderboard";
}

const SCALE_DISCLAIMER = "Payouts shown are based on reaching the maximum entries. With fewer players, amounts scale proportionally.";

export function PrizeDisplay({
  prizeStructure,
  prizePot,
  maxEntries,
  actualEntries,
  variant,
}: PrizeDisplayProps) {
  const scaled = calculatePayouts(prizeStructure, maxEntries, actualEntries);
  const pot = scaledPrizePot(prizePot, maxEntries, actualEntries);
  const isScaled =
    !!maxEntries && actualEntries != null && actualEntries > 0 && actualEntries < maxEntries;

  if (variant === "pool-home") {
    if (scaled && scaled.length > 0) {
      return (
        <div className="space-y-1.5">
          <div className="bg-primary/5 border border-primary/20 px-5 py-3 rounded-lg shadow-[0_0_15px_rgba(30,144,255,0.05)] min-w-[120px]">
            <div className="text-xs text-primary/80 uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
              <Trophy className="w-3 h-3" /> Prizes
              {isScaled && (
                <span className="text-[9px] text-muted-foreground/60 normal-case font-normal ml-1">(est.)</span>
              )}
            </div>
            <div className="space-y-0.5">
              {scaled.map((p) => (
                <div key={p.place} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground text-xs">{ORDINALS[p.place - 1]}</span>
                  <span className="font-bebas text-base text-primary">${p.amount}</span>
                </div>
              ))}
            </div>
          </div>
          {isScaled && (
            <p className="text-[11px] text-amber-400/70 leading-snug px-0.5">
              {SCALE_DISCLAIMER}
            </p>
          )}
        </div>
      );
    }
    if (pot && pot > 0) {
      return (
        <div className="space-y-1.5">
          <div className="bg-primary/5 border border-primary/20 px-5 py-3 rounded-lg text-center shadow-[0_0_15px_rgba(30,144,255,0.05)]">
            <div className="text-xs text-primary/80 uppercase font-bold tracking-wider mb-1">
              Prize Pot{isScaled ? " (est.)" : ""}
            </div>
            <div className="font-bebas text-3xl text-primary">${pot}</div>
          </div>
          {isScaled && (
            <p className="text-[11px] text-amber-400/70 leading-snug px-0.5">
              {SCALE_DISCLAIMER}
            </p>
          )}
        </div>
      );
    }
    return null;
  }

  if (variant === "join-invite") {
    if (scaled && scaled.length > 0) {
      return (
        <>
          {scaled.map((p) => (
            <div
              key={p.place}
              className="flex items-center gap-1.5 rounded-full border border-border/30 bg-muted/20 px-3.5 py-1.5 text-sm text-muted-foreground backdrop-blur-sm"
            >
              <span className="text-primary/70"><Trophy className="w-3.5 h-3.5" /></span>
              <span className="text-foreground font-semibold">{ORDINALS[p.place - 1]}:</span>
              <span className="text-foreground font-semibold">${p.amount}</span>
              {isScaled && p.place === 1 && (
                <span className="text-[10px] text-muted-foreground/60">(est.)</span>
              )}
            </div>
          ))}
          {isScaled && (
            <p className="text-[11px] text-amber-400/70 leading-snug w-full">
              {SCALE_DISCLAIMER}
            </p>
          )}
        </>
      );
    }
    if (pot && pot > 0) {
      return (
        <>
          <div className="flex items-center gap-1.5 rounded-full border border-border/30 bg-muted/20 px-3.5 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            <span className="text-primary/70"><Trophy className="w-3.5 h-3.5" /></span>
            <span className="text-foreground font-semibold">${pot}</span>
            <span className="text-muted-foreground/60">prize pot{isScaled ? " (est.)" : ""}</span>
          </div>
          {isScaled && (
            <p className="text-[11px] text-amber-400/70 leading-snug w-full">
              {SCALE_DISCLAIMER}
            </p>
          )}
        </>
      );
    }
    return null;
  }

  if (variant === "pool-card") {
    // Use scaledPrizePot (same source as pool-home/leaderboard) so all surfaces
    // agree. Re-sum structure amounts only when prizePot itself is absent.
    const structureFallback =
      pot == null && scaled && scaled.length > 0
        ? Math.round(scaled.reduce((s, p) => s + p.amount, 0) * 100) / 100
        : null;
    const total = pot ?? structureFallback;
    if (!total || total <= 0) return null;
    return (
      <div className="w-full space-y-1">
        <div className="w-full p-2 bg-primary/10 rounded border border-primary/20 text-center">
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mr-2">
            Prize Pot{isScaled ? " (est.)" : ""}
          </span>
          <span className="font-bebas text-lg text-primary">${total}</span>
        </div>
        {isScaled && (
          <p className="text-[10px] text-amber-400/60 leading-snug text-center px-1">
            {SCALE_DISCLAIMER}
          </p>
        )}
      </div>
    );
  }

  if (variant === "leaderboard") {
    if (!scaled || scaled.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mr-1">
            Prizes{isScaled ? " (est.)" : ""}:
          </span>
          {scaled.map((p) => (
            <span
              key={p.place}
              className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 rounded-full px-2.5 py-0.5 font-semibold"
            >
              {ORDINALS[p.place - 1]}: ${p.amount}
            </span>
          ))}
        </div>
        {isScaled && (
          <p className="text-[11px] text-amber-400/70 leading-snug px-0.5">
            {SCALE_DISCLAIMER}
          </p>
        )}
      </div>
    );
  }

  return null;
}
