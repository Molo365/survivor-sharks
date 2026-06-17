import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetPickEmGames, getGetPickEmGamesQueryKey } from "@workspace/api-client-react";
import type { PickEmGame } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Lock, Dice5, AlertCircle, Trophy, Check, X, Clock } from "lucide-react";

const MAX_PICKS = 8;

// ── Types ────────────────────────────────────────────────────────────────────

interface CrazyEightsViewProps {
  poolId: number;
}

interface SubmittedPick {
  gameId: string;
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string;
  homeTeam: { id: string; abbreviation: string; name: string; logoUrl: string | null };
  awayTeam: { id: string; abbreviation: string; name: string; logoUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
  startTime: string;
  status: string;
}

interface SubmittedPicksResponse {
  picks: SubmittedPick[];
  tiebreakerRuns: number | null;
  tiebreakerStrikeouts: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function teamLogoSrc(team: { logoUrl?: string | null; abbreviation: string }) {
  return team.logoUrl ?? `https://a.espncdn.com/i/teamlogos/mlb/500/${String(team.abbreviation ?? "").toLowerCase()}.png`;
}

function formatTimeEt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "—";
  }
}

function pitcherLine(pitcher: PickEmGame["awayPitcher"]) {
  if (!pitcher?.name) return null;
  const rec = pitcher.wins != null && pitcher.losses != null ? `(${pitcher.wins}-${pitcher.losses})` : null;
  const era = pitcher.era != null ? `${pitcher.era} ERA` : null;
  return [pitcher.name, rec, era].filter(Boolean).join(" ");
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

// ── Locked picks view ────────────────────────────────────────────────────────

function LockedPickRow({ pick }: { pick: SubmittedPick }) {
  const isFinal = pick.status === "final";
  const isLive = pick.status === "in_progress";
  const isPostponed = pick.status === "postponed";

  type TeamShape = SubmittedPick["homeTeam"];

  function teamSide(team: TeamShape, side: "away" | "home", score: number | null) {
    const isPicked = pick.pickedTeamId === team.id;
    const isCorrect = isPicked && pick.result === "correct";
    const isWrong = isPicked && pick.result === "incorrect";
    const isHome = side === "home";

    const logo = (
      <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
        <img
          src={teamLogoSrc(team)}
          alt={team.name}
          className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    );

    const info = (
      <div className={cn(
        "flex-1 flex flex-col gap-0.5 min-w-0",
        isHome ? "items-end text-right" : "items-start text-left",
      )}>
        <span className={cn(
          "font-bebas tracking-wide text-base sm:text-lg leading-tight",
          isPicked ? "text-foreground" : "text-muted-foreground",
        )}>
          {team.name}
        </span>
        {(isFinal || isLive) && score != null && (
          <span className={cn(
            "font-bebas text-3xl leading-none mt-0.5",
            isLive
              ? "text-white"
              : isPicked && isCorrect
                ? "text-green-400"
                : isPicked && isWrong
                  ? "text-destructive/70"
                  : "text-foreground/60",
          )}>
            {score}
          </span>
        )}
        {isPicked && (
          <div className="flex items-center gap-1 mt-0.5">
            {isCorrect ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-400 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Correct · My Pick
              </span>
            ) : isWrong ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-destructive/80 flex items-center gap-0.5">
                <X className="w-3 h-3" /> Wrong · My Pick
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> My Pick
              </span>
            )}
          </div>
        )}
      </div>
    );

    return (
      <div className={cn(
        "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2",
        isPicked && !isCorrect && !isWrong
          ? "border-primary bg-primary/10 ring-2 ring-primary/40"
          : isPicked && isCorrect
            ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/40"
            : isPicked && isWrong
              ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
              : "border-border/40 bg-card/60",
        isHome ? "flex-row-reverse" : "flex-row",
      )}>
        {logo}
        {info}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Confidence badge */}
      <div className={cn(
        "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center font-bebas text-xl md:text-2xl border-2",
        pick.result === "correct"   ? "bg-green-500/15 border-green-500/40 text-green-300" :
        pick.result === "incorrect" ? "bg-red-500/15   border-red-500/40   text-red-300"   :
                                 "bg-purple-500/15 border-purple-500/40 text-purple-300",
      )}>
        {pick.confidencePoints ?? "—"}
      </div>

      {/* Game card — mirrors PickEmView GameCard */}
      <div className={cn(
        "flex-1 shark-card rounded-xl border overflow-hidden relative",
        isLive
          ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]"
          : "border-border/40",
      )}>
        {/* Pulsing live border overlay */}
        {isLive && (
          <span className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none z-10" />
        )}
        {/* LIVE badge */}
        {isLive && (
          <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shadow-md">
            <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
            Live
          </span>
        )}

        <div className="flex items-stretch gap-0">
          {teamSide(pick.awayTeam, "away", pick.awayScore)}

          {/* Center divider */}
          <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[48px] sm:px-3 sm:min-w-[64px]">
            {isLive ? (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none whitespace-nowrap">
                ● LIVE
              </span>
            ) : isFinal ? (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
                Final
              </span>
            ) : isPostponed ? (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/40 leading-none">
                PPD
              </span>
            ) : (
              <>
                <span className="font-bebas text-[10px] text-muted-foreground/50 tracking-widest uppercase">
                  vs
                </span>
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-primary/50 shrink-0" />
                  <span className="text-[9px] text-muted-foreground/60 leading-tight font-medium whitespace-nowrap">
                    {formatTimeEt(pick.startTime)}
                  </span>
                </div>
              </>
            )}
          </div>

          {teamSide(pick.homeTeam, "home", pick.homeScore)}
        </div>
      </div>
    </div>
  );
}

function LockedPicksView({ picks, tiebreakerRuns, tiebreakerStrikeouts }: {
  picks: SubmittedPick[];
  tiebreakerRuns: number | null;
  tiebreakerStrikeouts: number | null;
}) {
  const sorted = [...picks].sort((a, b) => (b.confidencePoints ?? 0) - (a.confidencePoints ?? 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-400" />
            Your Crazy 8's Picks
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Today's picks are submitted and locked.</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-full">
          <Lock className="w-3 h-3" /> Locked
        </span>
      </div>

      {/* Submitted banner */}
      <div className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
        <Trophy className="w-5 h-5 text-purple-400 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Picks submitted!</p>
          <p className="text-xs text-muted-foreground">Your Crazy 8's picks are locked in. Good luck!</p>
        </div>
      </div>

      {/* Picks list */}
      <div>
        <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
          8 Picks · Sorted by confidence
        </p>
        <div className="space-y-2">
          {sorted.map((pick) => (
            <LockedPickRow key={pick.gameId} pick={pick} />
          ))}
        </div>
      </div>

      {/* Tiebreaker */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
          Tiebreaker Answers
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">Total combined runs</p>
            <p className="font-bebas text-2xl text-purple-300">{tiebreakerRuns ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">Total strikeouts</p>
            <p className="font-bebas text-2xl text-purple-300">{tiebreakerStrikeouts ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GameCard (selection UI) ──────────────────────────────────────────────────

function GameCard({
  game,
  isSelected,
  isLocked,
  confidence,
  usedPoints,
  pickedTeam,
  onToggle,
  onAssignConfidence,
  onPickTeam,
}: {
  game: PickEmGame;
  isSelected: boolean;
  isLocked: boolean;
  confidence: number | undefined;
  usedPoints: Set<number>;
  pickedTeam: string | null;
  onToggle: () => void;
  onAssignConfidence: (pts: number) => void;
  onPickTeam: (teamId: string) => void;
}) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isPostponed = game.status === "postponed";
  const isSuspended = game.status === "suspended";

  const awayPitcher = pitcherLine(game.awayPitcher);
  const homePitcher = pitcherLine(game.homePitcher);

  return (
    <div className={cn(
      "rounded-lg border-2 transition-all overflow-hidden",
      isSuspended
        ? "border-border/30 bg-card/30 opacity-50 cursor-not-allowed"
        : isLive
          ? "border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
          : isSelected
            ? "border-purple-500/60 bg-purple-500/5"
            : "border-border/40 bg-card/50 hover:border-border",
      !isSuspended && isLocked && !isSelected && !isLive && "opacity-50 cursor-not-allowed",
    )}>
      {/* LIVE banner */}
      {isLive && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border-b border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
            LIVE{game.liveDetail ? ` · ${game.liveDetail}` : ""}
          </span>
        </div>
      )}

      {/* Game header row — click to toggle selection */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isSuspended || (isLocked && !isSelected)}
        className="w-full text-left p-3 md:p-5"
      >
        <div className="flex items-center gap-2">
          {/* Away team */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="shrink-0 rounded-full bg-white/90 p-1 shadow-sm">
              <img
                src={teamLogoSrc(game.awayTeam)}
                alt={game.awayTeam.name}
                className="w-8 h-8 md:w-10 md:h-10 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div className="min-w-0">
              <div className="font-bebas text-base md:text-xl tracking-wide leading-none truncate">{game.awayTeam.name}</div>
              {(isFinal || isLive) && game.awayScore != null ? (
                <div className="font-bebas text-2xl leading-none">{game.awayScore}</div>
              ) : (
                <>
                  <div className="text-[10px] md:text-xs text-muted-foreground">Away</div>
                  {awayPitcher && (
                    <div className="text-[9px] md:text-[11px] text-muted-foreground/70 leading-snug mt-0.5 max-w-[130px] md:max-w-none truncate">
                      {awayPitcher}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Center: status + select indicator */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 px-1">
            {isFinal ? (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
                Final
              </span>
            ) : isSuspended ? (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-orange-500/20 text-orange-400 border-orange-500/40 leading-none">
                SUSP
              </span>
            ) : isPostponed ? (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/40 leading-none">
                PPD
              </span>
            ) : isLive ? (
              <span className="text-[10px] font-bold text-red-400">vs</span>
            ) : (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatTimeEt(game.startTime)}
              </span>
            )}
            {isSelected ? (
              <Check className="w-5 h-5 text-purple-400 mt-0.5" />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 mt-0.5" />
            )}
          </div>

          {/* Home team */}
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <div className="min-w-0 text-right">
              <div className="font-bebas text-base md:text-xl tracking-wide leading-none truncate">{game.homeTeam.name}</div>
              {(isFinal || isLive) && game.homeScore != null ? (
                <div className="font-bebas text-2xl leading-none">{game.homeScore}</div>
              ) : (
                <>
                  <div className="text-[10px] md:text-xs text-muted-foreground">Home</div>
                  {homePitcher && (
                    <div className="text-[9px] md:text-[11px] text-muted-foreground/70 leading-snug mt-0.5 max-w-[130px] md:max-w-none truncate text-right">
                      {homePitcher}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="shrink-0 rounded-full bg-white/90 p-1 shadow-sm">
              <img
                src={teamLogoSrc(game.homeTeam)}
                alt={game.homeTeam.name}
                className="w-8 h-8 md:w-10 md:h-10 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Expanded section — confidence + winner pick — only when selected */}
      {isSelected && (
        <div className="px-3 pb-3 md:px-5 md:pb-5 space-y-2.5 border-t border-purple-500/20 pt-2.5">
          {/* Confidence points — shown first so they're immediately visible */}
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">
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
                      "w-8 h-8 md:w-10 md:h-10 rounded-md text-sm md:text-base font-bold border-2 transition-all",
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

          {/* Pick the winner */}
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">
              Pick the winner
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[game.awayTeam, game.homeTeam].map((team) => {
                const isPicked = pickedTeam === team.id;
                return (
                  <button
                    key={team.id}
                    type="button"
                    disabled={isLocked}
                    onClick={() => !isLocked && onPickTeam(team.id)}
                    className={cn(
                      "flex items-center gap-2 p-2 md:p-3 rounded-lg border-2 transition-all select-none text-left",
                      isLocked ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
                      isPicked
                        ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/40"
                        : "border-border/40 bg-card/60 hover:border-purple-500/30",
                    )}
                  >
                    <img
                      src={teamLogoSrc(team)}
                      alt={team.name}
                      className="w-5 h-5 md:w-7 md:h-7 object-contain shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className={cn(
                      "font-bebas text-sm md:text-base tracking-wide truncate",
                      isPicked ? "text-purple-300" : "text-muted-foreground",
                    )}>
                      {team.name}
                    </span>
                    {isPicked && <Check className="w-3.5 h-3.5 text-purple-400 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CrazyEightsView({ poolId }: CrazyEightsViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [pickedTeams, setPickedTeams] = useState<Record<string, string>>({});
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tbRuns, setTbRuns] = useState("");
  const [tbStrikeouts, setTbStrikeouts] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const myPicksKey = ["crazy-eights-picks", poolId];

  const { data: myPicksData, isLoading: picksLoading } = useQuery<SubmittedPicksResponse>({
    queryKey: myPicksKey,
    queryFn: () => authedFetch<SubmittedPicksResponse>(`/api/pools/${poolId}/crazy-eights/picks`),
    retry: false,
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: slate, isLoading: slateLoading } = useGetPickEmGames(poolId, undefined, {
    query: {
      queryKey: getGetPickEmGamesQueryKey(poolId, undefined),
      refetchInterval: 30_000,
    },
  });

  const games: PickEmGame[] = slate?.games ?? [];

  const existingPicks = myPicksData?.picks ?? [];
  const hasPicks = existingPicks.length > 0;

  const earliestSelectedStart = useMemo(() => {
    const selected = games.filter((g) => selectedIds.includes(g.id));
    if (selected.length === 0) return Infinity;
    const times = selected
      .map((g) => new Date(g.startTime).getTime())
      .filter((t) => !isNaN(t));
    return times.length > 0 ? Math.min(...times) : Infinity;
  }, [games, selectedIds]);

  const isLocked = Date.now() >= earliestSelectedStart;

  const usedPoints = useMemo(
    () => new Set(Object.values(confidence)),
    [confidence],
  );

  const allReady =
    selectedIds.length === MAX_PICKS &&
    selectedIds.every((id) => confidence[id] !== undefined) &&
    selectedIds.every((id) => pickedTeams[id] !== undefined);

  function toggleGame(gameId: string) {
    if (isLocked) return;
    if (selectedIds.includes(gameId)) {
      setSelectedIds((prev) => prev.filter((id) => id !== gameId));
      setConfidence((prev) => { const c = { ...prev }; delete c[gameId]; return c; });
      setPickedTeams((prev) => { const p = { ...prev }; delete p[gameId]; return p; });
    } else {
      if (selectedIds.length >= MAX_PICKS) {
        toast({ title: "8 games max", description: "Deselect a game before adding another.", variant: "destructive" });
        return;
      }
      setSelectedIds((prev) => [...prev, gameId]);
    }
  }

  function assignConfidence(gameId: string, pts: number) {
    if (isLocked) return;
    setConfidence((prev) => {
      const c = { ...prev };
      const prevHolder = Object.keys(c).find((k) => c[k] === pts && k !== gameId);
      if (prevHolder) delete c[prevHolder];
      c[gameId] = pts;
      return c;
    });
  }

  function pickTeam(gameId: string, teamId: string) {
    if (isLocked) return;
    setPickedTeams((prev) => ({ ...prev, [gameId]: teamId }));
  }

  function handleSubmitClick() {
    if (selectedIds.length < MAX_PICKS) {
      toast({ title: "Select 8 games", description: "You must choose exactly 8 games.", variant: "destructive" });
      return;
    }
    if (!selectedIds.every((id) => pickedTeams[id])) {
      toast({ title: "Pick a winner", description: "Choose a winning team for each selected game.", variant: "destructive" });
      return;
    }
    if (!allReady) {
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
        pickedTeam: pickedTeams[id] ?? "",
        confidencePoints: confidence[id],
      }));
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/crazy-eights/picks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          picks,
          tiebreakerRuns: parseInt(tbRuns, 10),
          tiebreakerStrikeouts: parseInt(tbStrikeouts, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Submission failed");
      }
      setShowTiebreaker(false);
      toast({ title: "Picks submitted!", description: "Good luck. Picks are now locked." });
      await queryClient.invalidateQueries({ queryKey: myPicksKey });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (picksLoading || slateLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // ── Locked view — picks already submitted ──────────────────────────────────

  if (hasPicks) {
    return (
      <LockedPicksView
        picks={existingPicks}
        tiebreakerRuns={myPicksData?.tiebreakerRuns ?? null}
        tiebreakerStrikeouts={myPicksData?.tiebreakerStrikeouts ?? null}
      />
    );
  }

  // ── No games ───────────────────────────────────────────────────────────────

  if (games.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-bebas text-2xl tracking-wide mb-1">No Games Today</p>
        <p className="text-sm">Check back when today's MLB slate is available.</p>
      </div>
    );
  }

  // ── Open selection UI ──────────────────────────────────────────────────────

  const missingWinner = selectedIds.some((id) => !pickedTeams[id]);
  const missingPoints = selectedIds.length === MAX_PICKS && !selectedIds.every((id) => confidence[id] !== undefined);

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
            Select 8 games, pick a winner for each, and assign confidence points 1–8.
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

      {/* Game list */}
      <div className="space-y-3">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            isSelected={selectedIds.includes(game.id)}
            isLocked={isLocked}
            confidence={confidence[game.id]}
            usedPoints={usedPoints}
            pickedTeam={pickedTeams[game.id] ?? null}
            onToggle={() => toggleGame(game.id)}
            onAssignConfidence={(pts) => assignConfidence(game.id, pts)}
            onPickTeam={(teamId) => pickTeam(game.id, teamId)}
          />
        ))}
      </div>

      {/* Submit button */}
      <Button
        onClick={handleSubmitClick}
        disabled={isLocked || selectedIds.length < MAX_PICKS || !allReady}
        className="w-full font-bebas text-xl tracking-wider h-12 bg-purple-600 hover:bg-purple-500 text-white"
      >
        {selectedIds.length < MAX_PICKS
          ? `Select ${MAX_PICKS - selectedIds.length} more game${MAX_PICKS - selectedIds.length === 1 ? "" : "s"}`
          : missingWinner
            ? "Pick a winner for each game"
            : missingPoints
              ? "Assign all confidence points"
              : "Submit Picks"}
      </Button>

      {/* Tiebreaker dialog */}
      <Dialog open={showTiebreaker} onOpenChange={setShowTiebreaker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">Tiebreaker</DialogTitle>
            <DialogDescription>
              In case of a tie, your answers below will be used to determine the winner. The player closest to the actual number wins. Both answers are locked with your picks.
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
