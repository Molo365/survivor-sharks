import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

function collapsedStorageKey(poolId: string | number, userId: string | number | undefined) {
  return `pickem-welcome-collapsed-${poolId}-${userId ?? "guest"}`;
}

function legacyDismissedKey(poolId: string | number, userId: string | number | undefined) {
  return `pickem-welcome-dismissed-${poolId}-${userId ?? "guest"}`;
}

function readStartsCollapsed(
  poolId: string | number,
  userId: string | number | undefined,
  poolWeek?: number,
): boolean {
  try {
    const key = collapsedStorageKey(poolId, userId);
    if (localStorage.getItem(key) === "1") return true;
    // Prior behavior hid the banner entirely; show the slim bar instead.
    if (localStorage.getItem(legacyDismissedKey(poolId, userId)) === "1") {
      localStorage.setItem(key, "1");
      return true;
    }
    // Week 1: show full rules; week 2+ default to the slim bar (user can still expand).
    if (poolWeek != null && poolWeek > 1) return true;
    return false;
  } catch {
    return false;
  }
}

function persistCollapsed(poolId: string | number, userId: string | number | undefined) {
  try {
    localStorage.setItem(collapsedStorageKey(poolId, userId), "1");
    localStorage.setItem(legacyDismissedKey(poolId, userId), "1");
  } catch {
    /* ignore */
  }
}

type PickEmWelcomePanelProps = {
  poolId: string | number;
  userId?: string | number | null;
  emoji: string;
  poolName: string;
  /** Pool week (e.g. NFL wk 5). Week 1 opens expanded; week 2+ opens collapsed unless user saved collapse. */
  poolWeek?: number;
  children: ReactNode;
};

/** How-to-play block: full on first visit; after collapse, a slim bar stays to re-open rules. */
export function PickEmWelcomePanel({
  poolId,
  userId,
  emoji,
  poolName,
  poolWeek,
  children,
}: PickEmWelcomePanelProps) {
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const collapsed = readStartsCollapsed(poolId, userId ?? undefined, poolWeek);
    setExpanded(!collapsed);
    setReady(true);
  }, [poolId, userId, poolWeek]);

  if (!ready) return null;

  function collapse() {
    persistCollapsed(poolId, userId ?? undefined);
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-base leading-none">{emoji}</span>
          <span className="truncate">How to play — {poolName}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  }

  return (
    <div className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 pr-10">
      <span className="text-xl leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0">
        <p className="font-semibold text-sm text-foreground leading-snug">Welcome to {poolName}!</p>
        <div className="text-sm text-muted-foreground mt-0.5 leading-snug">{children}</div>
      </div>
      <button
        type="button"
        onClick={collapse}
        className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
        aria-label="Collapse how to play"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
    </div>
  );
}
