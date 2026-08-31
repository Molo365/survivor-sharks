import type { PoolPickStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const statusCopy: Record<PoolPickStatus["pickStatus"], string> = {
  submitted: "Picks submitted",
  pending: "Picks not submitted",
  not_required: "No pick required",
};

const statusColor: Record<PoolPickStatus["pickStatus"], string> = {
  submitted: "bg-green-400",
  pending: "bg-red-400",
  not_required: "bg-muted-foreground/40",
};

export function PickStatusIndicator({
  status,
  className,
}: {
  status?: PoolPickStatus["pickStatus"];
  className?: string;
}) {
  if (!status) return null;

  return (
    <span
      role="img"
      aria-label={statusCopy[status]}
      title={statusCopy[status]}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", statusColor[status], className)}
    />
  );
}