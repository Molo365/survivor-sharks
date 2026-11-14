import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function isHintDismissed(storageKey: string, legacyKeys: string[]): boolean {
  try {
    if (localStorage.getItem(storageKey) === "1") return true;
    return legacyKeys.some((key) => localStorage.getItem(key) === "1");
  } catch {
    return false;
  }
}

function persistHintDismissed(storageKey: string, legacyKeys: string[]) {
  try {
    localStorage.setItem(storageKey, "1");
    for (const key of legacyKeys) localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

type CollapsibleHowToHintProps = {
  storageKey: string;
  /** Older dismiss keys treated as dismissed (e.g. merged duplicate hints). */
  legacyStorageKeys?: string[];
  emoji: string;
  title: string;
  children: ReactNode;
  variant?: "primary" | "amber";
  defaultOpen?: boolean;
};

/** Single dismissible how-to card; tap title row to expand/collapse body. */
export function CollapsibleHowToHint({
  storageKey,
  legacyStorageKeys = [],
  emoji,
  title,
  children,
  variant = "primary",
  defaultOpen = true,
}: CollapsibleHowToHintProps) {
  const [visible, setVisible] = useState(
    () => !isHintDismissed(storageKey, legacyStorageKeys),
  );
  const [open, setOpen] = useState(defaultOpen);

  if (!visible) return null;

  const shellClass =
    variant === "amber"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-primary/30 bg-primary/5";

  return (
    <div className={cn("relative rounded-xl border pr-10", shellClass)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className="text-xl leading-none mt-0.5">{emoji}</span>
          <CollapsibleTrigger className="flex flex-1 items-center justify-between gap-2 min-w-0 text-left">
            <span className="font-semibold text-sm text-foreground leading-snug">{title}</span>
            <ChevronDown
              className={cn(
                "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="px-4 pb-3.5 pl-11 text-sm text-muted-foreground leading-snug space-y-2">
          {children}
        </CollapsibleContent>
      </Collapsible>
      <button
        type="button"
        onClick={() => {
          persistHintDismissed(storageKey, legacyStorageKeys);
          setVisible(false);
        }}
        className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
        aria-label="Dismiss hint"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}