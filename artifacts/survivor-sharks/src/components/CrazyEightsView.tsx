import { useState, useMemo } from "react";
import { useGetPickEmGames, getGetPickEmGamesQueryKey } from "@workspace/api-client-react";
import type { PickEmGame } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Lock, Dice5, CheckCircle2, AlertCircle, Trophy } from "lucide-react";

const MAX_PICKS = 8;

interface CrazyEightsViewProps {
  poolId: number;
}

function TeamLogo({ abbrev, name }: { abbrev: string; name: string }) {
  const logoUrl = `https://a.espncdn.com/i/teamlogos/mlb/500/${abbrev.toLowerCase()}.png`;
  return (
    <img
      src={logoUrl}
      alt={name}
      className="w-8 h-8 object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function GameCard({
  game,
  isSelected,
  isLocked,
  confidence,
  usedPoints,
  onToggle,
  onAssignConfidence,
}: {
  game: PickEmGame;
  isSelected: boolean;
  isLocked: boolean;
  confidence: number | undefined;
  usedPoints: Set<number>;
  onToggle: () => void;
  onAssignConfidence: (pts: number) => void;
}) {
  const startTime = new Date(game.startTime);
  const timeStr = startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const gameStarted = new Date() >= startTime;

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 transition-all",
        isSelected
          ? "border-purple-500/60 bg-purple-500/5"
          : "border-border/40 bg-card/50 hover:border-border",
        isLocked && !isSelected && "opacity-50 cursor-not-allowed",
      )}
    >
      {/* Game row */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isLocked}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo abbrev={(game as any).awayTeamAbbrev ?? game.awayTeam} name={game.awayTeam} />
            <div className="min-w-0">
              <div className="font-bebas text-base tracking-wide leading-none truncate">{game.awayTeam}</div>
              <div className="text-[10px] text-muted-foreground">Away</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-bold shrink-0">vs</div>
          <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
            <TeamLogo abbrev={(game as any).homeTeamAbbrev ?? game.homeTeam} name={game.homeTeam} />
            <div className="min-w-0 text-right">
              <div className="font-bebas text-base tracking-wide leading-none truncate">{game.homeTeam}</div>
              <div className="text-[10px] text-muted-foreground">Home</div>
            </div>
          </div>
          <div className="ml-auto flex flex-col items-end shrink-0 gap-0.5">
            {gameStarted ? (
              <span className="flex items-center gap-1 text-[10px] text-destructive font-semibold">
                <Lock className="w-3 h-3" /> Started
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">{timeStr}</span>
            )}
            {isSelected ? (
              <CheckCircle2 className="w-5 h-5 text-purple-400" />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
            )}
          </div>
        </div>
      </button>

      {/* Confidence row — only when game is selected */}
      {isSelected && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">
            Confidence points
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((pts) => {
              const taken = usedPoints.has(pts) && confidence !== pts;
              return (
                <button
                  key={pts}
                  type="button"
                  disabled={isLocked || taken}
                  onClick={() => onAssignConfidence(pts)}
                  className={cn(
                    "w-8 h-8 rounded-md text-sm font-bold border-2 transition-all",
                    confidence === pts
                      ? "bg-purple-500 border-purple-400 text-white"
                      : taken
                      ? "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                      : "border-border/50 text-muted-foreground hover:border-purple-500/50 hover:text-purple-400",
                  )}
                >
                  {pts}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CrazyEightsView({ poolId }: CrazyEightsViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tbRuns, setTbRuns] = useState("");
  const [tbStrikeouts, setTbStrikeouts] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: slate, isLoading, error } = useGetPickEmGames(poolId, undefined, {
    query: { queryKey: getGetPickEmGamesQueryKey(poolId) },
  });

  const games: PickEmGame[] = slate?.games ?? [];

  const earliestSelectedStart = useMemo(() => {
    const selected = games.filter((g) => selectedIds.includes(g.id));
    if (selected.length === 0) return Infinity;
    return Math.min(...selected.map((g) => new Date(g.startTime).getTime()));
  }, [games, selectedIds]);

  const lastGame = useMemo(() => {
    if (games.length === 0) return null;
    return [...games].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    )[0];
  }, [games]);

  const isLocked = Date.now() >= earliestSelectedStart;

  const usedPoints = useMemo(
    () => new Set(Object.values(confidence)),
    [confidence],
  );

  const allPointsAssigned =
    selectedIds.length === MAX_PICKS &&
    selectedIds.every((id) => confidence[id] !== undefined);

  function toggleGame(gameId: string) {
    if (submitted || isLocked) return;
    if (selectedIds.includes(gameId)) {
      setSelectedIds((prev) => prev.filter((id) => id !== gameId));
      setConfidence((prev) => {
        const c = { ...prev };
        delete c[gameId];
        return c;
      });
    } else {
      if (selectedIds.length >= MAX_PICKS) {
        toast({
          title: "8 games max",
          description: "Deselect a game before adding another.",
          variant: "destructive",
        });
        return;
      }
      setSelectedIds((prev) => [...prev, gameId]);
    }
  }

  function assignConfidence(gameId: string, pts: number) {
    if (submitted || isLocked) return;
    setConfidence((prev) => {
      const c = { ...prev };
      const prevHolder = Object.keys(c).find((k) => c[k] === pts && k !== gameId);
      if (prevHolder) delete c[prevHolder];
      c[gameId] = pts;
      return c;
    });
  }

  function handleSubmitClick() {
    if (selectedIds.length < MAX_PICKS) {
      toast({ title: "Select 8 games", description: "You must choose exactly 8 games.", variant: "destructive" });
      return;
    }
    if (!allPointsAssigned) {
      toast({ title: "Assign all confidence points", description: "Each selected game needs a point value 1–8.", variant: "destructive" });
      return;
    }
    setShowTiebreaker(true);
  }

  async function handleFinalSubmit() {
    if (!tbRuns || !tbStrikeouts) {
      toast({ title: "Tiebreaker required", description: "Enter both tiebreaker values.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const picks = selectedIds.map((id) => ({
        gameId: id,
        confidencePoints: confidence[id],
      }));
      const res = await fetch(`/api/pools/${poolId}/crazy-eights/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          picks,
          tiebreaker: {
            totalRuns: parseInt(tbRuns, 10),
            totalStrikeouts: parseInt(tbStrikeouts, 10),
            gameId: lastGame?.id,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Submission failed");
      }
      setShowTiebreaker(false);
      setSubmitted(true);
      toast({ title: "Picks submitted!", description: "Good luck. Picks are now locked." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || games.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-bebas text-2xl tracking-wide mb-1">No Games Today</p>
        <p className="text-sm">Check back when today's MLB slate is available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Dice5 className="w-6 h-6 text-purple-400" />
            Crazy 8's — Today's Slate
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select exactly 8 games and assign confidence points 1–8 (each used once).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "text-sm font-bold px-3 py-1 rounded-full border",
            selectedIds.length === MAX_PICKS
              ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
              : "bg-muted/50 text-muted-foreground border-border/40",
          )}>
            {selectedIds.length} / {MAX_PICKS} selected
          </div>
          {isLocked && (
            <span className="flex items-center gap-1 text-xs text-destructive font-semibold bg-destructive/10 border border-destructive/20 px-2 py-1 rounded-full">
              <Lock className="w-3 h-3" /> Picks Locked
            </span>
          )}
        </div>
      </div>

      {/* Submitted banner */}
      {submitted && (
        <div className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
          <Trophy className="w-5 h-5 text-purple-400 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Picks submitted!</p>
            <p className="text-xs text-muted-foreground">Your Crazy 8's picks are locked in. Good luck!</p>
          </div>
        </div>
      )}

      {/* Game list */}
      <div className="space-y-3">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            isSelected={selectedIds.includes(game.id)}
            isLocked={isLocked || submitted}
            confidence={confidence[game.id]}
            usedPoints={usedPoints}
            onToggle={() => toggleGame(game.id)}
            onAssignConfidence={(pts) => assignConfidence(game.id, pts)}
          />
        ))}
      </div>

      {/* Submit button */}
      {!submitted && (
        <Button
          onClick={handleSubmitClick}
          disabled={isLocked || selectedIds.length < MAX_PICKS || !allPointsAssigned}
          className="w-full font-bebas text-xl tracking-wider h-12 bg-purple-600 hover:bg-purple-500 text-white"
        >
          {selectedIds.length < MAX_PICKS
            ? `Select ${MAX_PICKS - selectedIds.length} more game${MAX_PICKS - selectedIds.length === 1 ? "" : "s"}`
            : !allPointsAssigned
            ? "Assign all confidence points"
            : "Submit Picks"}
        </Button>
      )}

      {/* Tiebreaker dialog */}
      <Dialog open={showTiebreaker} onOpenChange={setShowTiebreaker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">Tiebreaker</DialogTitle>
            <DialogDescription>
              For the last game of the day
              {lastGame ? ` (${lastGame.awayTeam} @ ${lastGame.homeTeam})` : ""}, predict:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tb-runs">Total combined runs scored</Label>
              <Input
                id="tb-runs"
                type="number"
                min="0"
                placeholder="e.g. 9"
                value={tbRuns}
                onChange={(e) => setTbRuns(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-k">Total combined strikeouts</Label>
              <Input
                id="tb-k"
                type="number"
                min="0"
                placeholder="e.g. 16"
                value={tbStrikeouts}
                onChange={(e) => setTbStrikeouts(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowTiebreaker(false)} disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={handleFinalSubmit}
              disabled={submitting || !tbRuns || !tbStrikeouts}
              className="bg-purple-600 hover:bg-purple-500 text-white"
            >
              {submitting ? "Submitting…" : "Lock In Picks"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
