import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface GridTeam {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface GridGame {
  id: string;
  awayTeam: GridTeam;
  homeTeam: GridTeam;
  startTime: string;
  status: string;
  awayScore: number | null;
  homeScore: number | null;
}

interface GridPick {
  pickedTeamId: string | null;
  pickedTeamName: string | null;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

interface GridResponse {
  week: number;
  games: GridGame[];
  players: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    picks: Record<string, GridPick>;
  }>;
}

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

function PickCard({ game, pick }: { game: GridGame; pick: GridPick }) {
  const isCorrect = pick.result === "correct";
  const isIncorrect = pick.result === "incorrect";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg border",
        isCorrect
          ? "border-green-500/25 bg-green-500/[0.06]"
          : isIncorrect
            ? "border-destructive/25 bg-destructive/[0.06]"
            : "border-border/30 bg-muted/10",
      )}
    >
      <div className="shrink-0 w-7 h-7 rounded-full bg-background border border-muted-foreground/20 flex items-center justify-center">
        <span className="font-bebas text-[15px] leading-none text-foreground/80">
          {pick.confidencePoints ?? "?"}
        </span>
      </div>
      {pick.pickedTeamLogoUrl ? (
        <div className="shrink-0 w-7 h-7 rounded-full bg-white/90 p-0.5 flex items-center justify-center">
          <img
            src={pick.pickedTeamLogoUrl}
            alt={pick.pickedTeamName ?? ""}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center">
          <span className="text-[9px] font-bold uppercase">
            {pick.pickedTeamName?.slice(0, 3) ?? "?"}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {pick.pickedTeamName ?? "—"}
        </p>
        <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border leading-none",
          isCorrect
            ? "text-green-400 bg-green-500/10 border-green-500/25"
            : isIncorrect
              ? "text-destructive/80 bg-destructive/10 border-destructive/25"
              : "text-muted-foreground/40 bg-muted/10 border-border/30",
        )}
      >
        {isCorrect ? "W" : isIncorrect ? "L" : "–"}
      </span>
    </div>
  );
}

export function NflConfidenceWeeklyPickDetailDialog({
  poolId,
  week,
  userId,
  playerLabel,
  open,
  onOpenChange,
}: {
  poolId: number;
  week: number;
  userId: number;
  playerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentYear = new Date().getFullYear();

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-weekly-grid", poolId, week],
    queryFn: () =>
      authedFetch<GridResponse>(
        `/api/pools/${poolId}/nfl-confidence-weekly/grid?week=${week}&season=${currentYear}`,
      ),
    enabled: open && week >= 1,
    staleTime: 60_000,
  });

  const picksWithGames = useMemo(() => {
    if (!data) return null;
    const gridPlayer = data.players.find((p) => p.userId === userId);
    const picksMap = gridPlayer?.picks ?? {};
    return data.games
      .map((game) => ({ game, pick: picksMap[game.id] ?? null }))
      .filter(({ pick }) => pick !== null)
      .sort((a, b) => (b.pick!.confidencePoints ?? 0) - (a.pick!.confidencePoints ?? 0)) as {
        game: GridGame;
        pick: GridPick;
      }[];
  }, [data, userId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide">
            Week {week} picks — {playerLabel}
          </DialogTitle>
          <DialogDescription>
            Confidence points earned on correct picks only.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground/40">Loading picks…</span>
          </div>
        ) : picksWithGames && picksWithGames.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {picksWithGames.map(({ game, pick }) => (
              <PickCard key={game.id} game={game} pick={pick} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic py-2">No picks recorded for this week.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
