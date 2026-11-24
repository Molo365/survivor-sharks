import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PickEmDailyPickDetail } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("Request failed");
    return r.json() as Promise<T>;
  });
}

type WeekPicksResponse = {
  week: number;
  weekStart: string;
  weekEnd: string;
  picks: PickEmDailyPickDetail[];
};

function PickRow({ pick, isNbaAts }: { pick: PickEmDailyPickDetail; isNbaAts?: boolean }) {
  const WC_OPTIONS_PANEL = ["home_win", "draw", "away_win"] as const;
  const is3wayPick = pick.pickedTeamId != null
    && (WC_OPTIONS_PANEL as readonly string[]).includes(pick.pickedTeamId);
  const isDraw = is3wayPick && pick.pickedTeamId === "draw";
  const pickedIsHome = is3wayPick
    ? pick.pickedTeamId === "home_win"
    : pick.pickedTeamId === pick.homeTeam.id;
  const opponent = isDraw ? null : (pickedIsHome ? pick.awayTeam : pick.homeTeam);
  const hasScore = pick.homeScore !== null && pick.awayScore !== null;
  const pickedScore = (pickedIsHome || isDraw) ? pick.homeScore : pick.awayScore;
  const opponentScore = (pickedIsHome || isDraw) ? pick.awayScore : pick.homeScore;
  const spreadLabel = isNbaAts && pick.spread != null && pick.favoriteTeamId != null
    ? (pick.pickedTeamId === pick.favoriteTeamId ? `-${pick.spread}` : `+${pick.spread}`)
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg border",
        pick.result === "correct"
          ? "border-green-500/25 bg-green-500/[0.06]"
          : pick.result === "incorrect"
            ? "border-destructive/25 bg-destructive/[0.06]"
            : pick.result === "push"
              ? "border-muted-foreground/20 bg-muted/[0.06]"
              : "border-border/30 bg-muted/10",
      )}
    >
      <div className="shrink-0 w-4">
        {pick.result === "correct" ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" />
        ) : pick.result === "incorrect" ? (
          <XCircle className="w-4 h-4 text-red-400" />
        ) : pick.result === "pending" ? (
          <div className="w-4 h-4 rounded-full border-2 border-primary/30" />
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        )}
      </div>
      {pick.pickedTeamLogoUrl ? (
        <img src={pick.pickedTeamLogoUrl} alt="" className="w-7 h-7 object-contain shrink-0" />
      ) : null}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{pick.pickedTeamName ?? "—"}</p>
        <p className="text-[10px] text-muted-foreground/60 truncate">
          {isDraw
            ? `${pick.homeTeam.abbreviation} v ${pick.awayTeam.abbreviation}`
            : opponent
              ? `vs ${opponent.abbreviation}`
              : pick.awayTeam.abbreviation}
          {spreadLabel ? ` · ${spreadLabel}` : ""}
        </p>
      </div>
      {hasScore && (
        <span className="text-xs font-mono tabular-nums shrink-0 text-muted-foreground">
          {pickedScore}–{opponentScore}
        </span>
      )}
      <span
        className={cn(
          "shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border leading-none",
          pick.result === "correct"
            ? "text-green-400 bg-green-500/10 border-green-500/25"
            : pick.result === "incorrect"
              ? "text-destructive/80 bg-destructive/10 border-destructive/25"
              : pick.result === "push"
                ? "text-muted-foreground/70 bg-muted/10 border-border/30"
                : "text-muted-foreground/40 bg-muted/10 border-border/30",
        )}
      >
        {pick.result === "correct" ? "W" : pick.result === "incorrect" ? "L" : pick.result === "push" ? "P" : "–"}
      </span>
    </div>
  );
}

export function PickEmWeeklyPickDetailDialog({
  poolId,
  week,
  userId,
  playerLabel,
  open,
  onOpenChange,
  isNbaAts,
  periodLabel,
}: {
  poolId: number;
  week: number;
  userId: number;
  playerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isNbaAts?: boolean;
  periodLabel?: string | null;
}) {
  const { data, isLoading } = useQuery<WeekPicksResponse>({
    queryKey: ["pickem-week-picks", poolId, week, userId],
    queryFn: () =>
      authedFetch<WeekPicksResponse>(
        `/api/pools/${poolId}/pickem/week-picks?week=${week}&userId=${userId}`,
      ),
    enabled: open && week >= 1,
    staleTime: 60_000,
  });

  const titleWeek = periodLabel ?? `Week ${week}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide">
            {titleWeek} picks — {playerLabel}
          </DialogTitle>
          <DialogDescription>
            Game order by kickoff. Green = correct pick.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground/40">Loading picks…</span>
          </div>
        ) : data.picks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.picks.map((pick) => (
              <PickRow key={pick.gameId} pick={pick} isNbaAts={isNbaAts} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic py-2">No picks recorded for this week.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}