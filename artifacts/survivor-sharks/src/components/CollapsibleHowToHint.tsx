import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function readExpandedPreference(storageKey: string, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(`${storageKey}-expanded`);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

function persistExpandedPreference(storageKey: string, open: boolean) {
  try {
    localStorage.setItem(`${storageKey}-expanded`, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

type CollapsibleHowToHintProps = {
  /** Used only to remember expanded vs collapsed (not permanent hide). */
  storageKey: string;
  emoji: string;
  title: string;
  children: ReactNode;
  variant?: "primary" | "amber";
  defaultOpen?: boolean;
};

/** How-to card: title row always visible; tap to expand/collapse instructions. */
export function CollapsibleHowToHint({
  storageKey,
  emoji,
  title,
  children,
  variant = "primary",
  defaultOpen = true,
}: CollapsibleHowToHintProps) {
  const [open, setOpen] = useState(() => readExpandedPreference(storageKey, defaultOpen));

  const shellClass =
    variant === "amber"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-primary/30 bg-primary/5";

  return (
    <div className={cn("rounded-xl border", shellClass)}>
      <Collapsible
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          persistExpandedPreference(storageKey, next);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3.5 text-left min-h-[44px]">
          <span className="text-xl leading-none shrink-0">{emoji}</span>
          <span className="flex-1 min-w-0 font-semibold text-sm text-foreground leading-snug">{title}</span>
          <ChevronDown
            className={cn(
              "w-5 h-5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-3.5 pl-11 text-sm text-muted-foreground leading-snug space-y-2 border-t border-border/20">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}