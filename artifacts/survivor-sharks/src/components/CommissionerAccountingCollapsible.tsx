import { useState, type ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/** Large pools start collapsed so commissioner tools stay above the fold. */
const AUTO_EXPAND_MAX_PLAYERS = 8;

type CommissionerAccountingCollapsibleProps = {
  title: string;
  description?: ReactNode;
  /** Shown under the title while collapsed (entry/net snapshot). */
  collapsedSummary?: string;
  playerCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CommissionerAccountingCollapsible({
  title,
  description,
  collapsedSummary,
  playerCount,
  defaultOpen,
  children,
}: CommissionerAccountingCollapsibleProps) {
  const initialOpen =
    defaultOpen ?? (playerCount != null ? playerCount <= AUTO_EXPAND_MAX_PLAYERS : false);
  const [open, setOpen] = useState(initialOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border/40 bg-card/60 overflow-hidden"
    >
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full items-start gap-3 p-6 text-left transition-colors hover:bg-muted/20",
          open && "border-b border-border/40",
        )}
      >
        <Wallet className="w-6 h-6 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-bebas text-2xl tracking-wide">{title}</h4>
          {!open && collapsedSummary && (
            <p className="text-sm text-muted-foreground mt-1">{collapsedSummary}</p>
          )}
          {!open && !collapsedSummary && (
            <p className="text-xs text-muted-foreground mt-1">Tap to expand accounting</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 shrink-0 text-muted-foreground mt-1 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {description ? (
          <div className="px-6 pt-4 text-sm text-muted-foreground">{description}</div>
        ) : null}
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
