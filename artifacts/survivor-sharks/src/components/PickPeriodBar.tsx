import { CalendarRange, Lock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PickPeriodListItem = {
  key: string;
  label: string;
  status: "current" | "completed";
};

export type PickPeriodListResponse = {
  periods: PickPeriodListItem[];
  defaultKey: string | null;
};

export function PickPeriodBar({
  periods,
  activeKey,
  onChange,
  viewingPast,
  periodLabel,
}: {
  periods: PickPeriodListItem[];
  activeKey: string | undefined;
  onChange: (key: string) => void;
  viewingPast: boolean;
  periodLabel: string;
}) {
  if (periods.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <p className="text-xs text-muted-foreground sm:mr-auto flex items-center gap-1.5 shrink-0">
          <CalendarRange className="h-3.5 w-3.5 opacity-60" aria-hidden />
          <span>
            <span className="font-semibold text-foreground/75">{periodLabel}</span>
            <span className="hidden sm:inline text-muted-foreground/80"> · all tabs</span>
          </span>
        </p>
        <Select value={activeKey ?? ""} onValueChange={onChange}>
          <SelectTrigger
            className={cn(
              "w-full sm:w-[min(100%,22rem)] h-11 text-sm font-medium border-2",
              "bg-background/90 text-foreground shadow-md",
              viewingPast
                ? "border-amber-400/90 ring-2 ring-amber-400/35 hover:bg-amber-500/10"
                : "border-yellow-400/90 ring-2 ring-yellow-400/45 hover:bg-yellow-500/15",
            )}
          >
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((period) => (
              <SelectItem key={period.key} value={period.key} className="text-sm">
                {period.label}
                {period.status === "current" ? " (current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {viewingPast && (
        <p className="text-xs text-amber-400/75 flex items-center gap-1 sm:justify-end">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          Past {periodLabel.toLowerCase()} — picks closed.
        </p>
      )}
    </div>
  );
}
