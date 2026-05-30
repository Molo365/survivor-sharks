import { useListSportInjuries } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Sport = "nfl" | "mlb" | "nba" | "nhl" | "fifa";

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s === "ir" || s.includes("injured reserve")) return "OUT";
  if (s.includes("doubtful")) return "DOUBTFUL";
  if (s.includes("questionable")) return "QUEST";
  if (s.includes("day-to-day") || s.includes("day to day")) return "DTD";
  return status.toUpperCase().slice(0, 8);
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s === "ir" || s.includes("injured reserve"))
    return "text-destructive bg-destructive/10 border-destructive/30";
  if (s.includes("doubtful"))
    return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  if (s.includes("questionable"))
    return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  return "text-muted-foreground bg-muted/20 border-border/40";
}

export function InjuriesTab({ sport }: { sport: Sport }) {
  const { data: teams, isLoading, error } = useListSportInjuries(sport);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive/60" />
        <p>Unable to load injury data right now.</p>
      </div>
    );
  }

  if (!teams?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <p className="text-lg font-medium text-foreground/60">No significant injuries reported</p>
        <p className="text-sm">All clear — no OUT, Doubtful, or Questionable players at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Showing OUT, Doubtful, Questionable, and Day-to-Day players across all {sport.toUpperCase()} teams.
      </p>

      {teams.map((team) => (
        <div key={team.teamId}>
          <h3 className="font-bebas text-2xl tracking-wider text-foreground/90 mb-3 pb-1.5 border-b border-border/40">
            {team.teamName}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <th className="pb-2 pr-4">Player</th>
                  <th className="pb-2 pr-4 w-12">Pos</th>
                  <th className="pb-2 pr-4 w-28">Status</th>
                  <th className="pb-2">Injury</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {team.injuries.map((inj, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2 pr-4 font-medium text-foreground/90">{inj.name}</td>
                    <td className={cn(
                      "py-2 pr-4 text-xs font-mono text-muted-foreground/70",
                    )}>
                      {inj.position ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                        statusColor(inj.status)
                      )}>
                        {statusLabel(inj.status)}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground/60">
                      {inj.injuryType ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
