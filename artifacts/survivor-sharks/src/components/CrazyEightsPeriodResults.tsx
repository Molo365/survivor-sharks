import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  formatPlaceLine,
  getBannerModel,
  type CrazyEightsPeriodResult,
} from "@/lib/periodResults";
import { cn } from "@/lib/utils";

interface CrazyEightsPeriodResultsProps {
  results: CrazyEightsPeriodResult[];
}

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  }).then((response) => {
    if (!response.ok) throw new Error("Request failed");
    return response.json() as Promise<T>;
  });
}

export function useCrazyEightsPeriodResults(poolId: number, sport: string) {
  const { user } = useAuth();
  const enabled = !!user && (sport === "nhl" || sport === "nba");

  return useQuery<CrazyEightsPeriodResult[]>({
    queryKey: ["crazy-eights-period-results", poolId],
    queryFn: () => authedFetch<CrazyEightsPeriodResult[]>(
      `/api/pools/${poolId}/crazy-eights/period-results`,
    ),
    staleTime: 60_000,
    enabled,
  });
}

function ResultLines({ result }: { result: CrazyEightsPeriodResult }) {
  return (
    <div className="space-y-1">
      {result.groups.length === 0 ? (
        <p className="text-sm text-yellow-300/80">No picks were made</p>
      ) : (
        [...result.groups]
          .sort((a, b) => a.position - b.position)
          .map((group) => (
            <p key={`${result.week}-${group.position}`} className="text-sm text-yellow-300">
              {formatPlaceLine({
                position: group.position,
                names: group.players.map((player) => player.username),
                prize: group.prize,
              })}
            </p>
          ))
      )}
    </div>
  );
}

export function CrazyEightsPeriodResults({ results }: CrazyEightsPeriodResultsProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const banner = getBannerModel(results);

  if (!banner) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
        <div className="min-w-0 flex-1">
          {banner.noPicks ? (
            <p className="text-sm font-semibold text-yellow-200">
              {banner.label}: no picks were made
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-yellow-200">
                {banner.label} winner{banner.places.length === 1 ? "" : "s"}
              </p>
              <div className="mt-1 space-y-0.5">
                {banner.places.map((place) => (
                  <p key={place.position} className="text-sm text-yellow-300">
                    {formatPlaceLine(place)}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-yellow-500/15",
            "px-4 py-2 text-left text-xs font-semibold text-yellow-400/80",
            "transition-colors hover:bg-yellow-500/5 hover:text-yellow-300",
          )}
        >
          <span>Past weekends ({results.length})</span>
          <span aria-hidden="true" className={cn("text-base transition-transform", historyOpen && "rotate-180")}>
            ▾
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 px-4 pt-3">
            {results.map((result) => (
              <div key={`${result.week}-${result.resolvedAt}`} className="border-l border-yellow-500/20 pl-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-500/70">
                  Weekend {result.week}
                </p>
                <ResultLines result={result} />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}