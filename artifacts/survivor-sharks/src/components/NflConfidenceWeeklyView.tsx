import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PickEmGame } from "@workspace/api-client-react";
import { useUpdatePool, getGetPoolQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Lock, Zap, AlertCircle, Trophy, Check, X, Clock, Copy, ShieldCheck, Settings2, CheckCircle2, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NflConfidenceWeeklyGrid } from "@/components/NflConfidenceWeeklyGrid";

// ── Winner Banner (exported for use at pool page level) ───────────────────────

interface WinnerBannerLeaderboardResponse {
  week: number;
  players: Array<{
    rank: number;
    userId: number;
    username: string;
    displayName: string | null;
    weekPoints: number;
    gradedPicks: number;
    totalPicks: number;
    potSplit: boolean;
  }>;
  actualPassingYards: number | null;
}

export function NflConfidenceWeeklyWinnerBanner({ poolId, currentWeek }: { poolId: number; currentWeek: number }) {
  const { data: leaderboardData } = useQuery<WinnerBannerLeaderboardResponse>({
    queryKey: ["nfl-confidence-weekly-leaderboard", poolId, currentWeek],
    queryFn: () => authedFetch<WinnerBannerLeaderboardResponse>(`/api/pools/${poolId}/nfl-confidence-weekly/leaderboard?week=${currentWeek}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const isWeekFullyGraded = leaderboardData?.actualPassingYards != null;
  const players = leaderboardData?.players ?? [];
  const weekWinner = isWeekFullyGraded && players.length > 0 ? players[0] : null;

  if (!weekWinner) return null;

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 to-amber-600/5 px-4 py-3.5 flex items-center gap-3">
      <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-0.5">
          🏆 Week {currentWeek} Winner
        </p>
        <p className="font-bebas text-lg tracking-wide leading-none text-foreground truncate">
          {weekWinner.displayName ?? weekWinner.username}
          {weekWinner.potSplit && (
            <span className="text-muted-foreground/60 text-base ml-1.5 font-sans font-normal">(split pot)</span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bebas text-2xl text-yellow-400 leading-none">{weekWinner.weekPoints}</p>
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">pts</p>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NflConfidenceWeeklyViewProps {
  poolId: number;
  currentWeek?: number;
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

interface TiebreakerGame {
  awayTeam: { abbreviation: string; name: string };
  homeTeam: { abbreviation: string; name: string };
  startTime: string;
}

interface SubmittedPicksResponse {
  picks: SubmittedPick[];
  tiebreakerPassingYards: number | null;
  tiebreakerRushingYards: number | null;
  tiebreakerGame: TiebreakerGame | null;
}

interface LeaderboardPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weekPoints: number;
  gradedPicks: number;
  totalPicks: number;
  potSplit: boolean;
}

interface WeeklyLeaderboardResponse {
  week: number;
  players: LeaderboardPlayer[];
  actualPassingYards: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function teamLogoSrc(team: { logoUrl?: string | null; abbreviation: string }) {
  return team.logoUrl ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${String(team.abbreviation ?? "").toLowerCase()}.png`;
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

// ── Locked picks view ─────────────────────────────────────────────────────────

function LockedPickRow({ pick }: { pick: SubmittedPick }) {
  const isFinal = pick.status === "final" || pick.result === "correct" || pick.result === "incorrect";
  const isLive = !isFinal && pick.status === "in_progress";
  const isPostponed = !isFinal && pick.status === "postponed";

  type TeamShape = SubmittedPick["homeTeam"];

  function teamSide(team: TeamShape, side: "away" | "home", score: number | null) {
    const isPicked = pick.pickedTeamId === team.id;
    const isCorrect = isPicked && pick.result === "correct";
    const isWrong = isPicked && pick.result === "incorrect";
    const isHome = side === "home";

    return (
      <div className={cn(
        "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2",
        isPicked && !isCorrect && !isWrong
          ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/40"
          : isPicked && isCorrect
            ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/40"
            : isPicked && isWrong
              ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
              : "border-border/40 bg-card/60",
        isHome ? "flex-row-reverse" : "flex-row",
      )}>
        <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
          <img
            src={teamLogoSrc(team)}
            alt={team.name}
            className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
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
              isLive ? "text-white"
                : isCorrect ? "text-green-400"
                : isWrong ? "text-destructive/70"
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/70 flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> My Pick
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className={cn(
        "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center font-bebas text-xl md:text-2xl border-2",
        pick.result === "correct"   ? "bg-green-500/15 border-green-500/40 text-green-300" :
        pick.result === "incorrect" ? "bg-red-500/15   border-red-500/40   text-red-300"   :
                                      "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
      )}>
        {pick.confidencePoints ?? "—"}
      </div>

      <div className={cn(
        "flex-1 shark-card rounded-xl border overflow-hidden relative",
        isLive ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]" : "border-border/40",
      )}>
        {isLive && (
          <span className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none z-10" />
        )}
        {isLive && (
          <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shadow-md">
            <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
            Live
          </span>
        )}
        <div className="flex items-stretch gap-0">
          {teamSide(pick.awayTeam, "away", pick.awayScore)}
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
                <span className="font-bebas text-[10px] text-muted-foreground/50 tracking-widest uppercase">vs</span>
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-cyan-500/50 shrink-0" />
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

function LockedPicksView({
  picks,
  tiebreakerPassingYards,
  tiebreakerRushingYards,
}: {
  picks: SubmittedPick[];
  tiebreakerPassingYards: number | null;
  tiebreakerRushingYards: number | null;
}) {
  const sorted = [...picks].sort((a, b) => (b.confidencePoints ?? 0) - (a.confidencePoints ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Lock className="w-5 h-5 text-cyan-400" />
            Your NFL Confidence Weekly Picks
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">This week's picks are submitted and locked.</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-cyan-400 font-semibold bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-full">
          <Lock className="w-3 h-3" /> Locked
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
        <Trophy className="w-5 h-5 text-cyan-400 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Picks submitted!</p>
          <p className="text-xs text-muted-foreground">Your NFL Confidence Weekly picks are locked in. Good luck!</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
          {sorted.length} Picks · Sorted by confidence
        </p>
        <div className="space-y-2">
          {sorted.map((pick) => (
            <LockedPickRow key={pick.gameId} pick={pick} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
          Tiebreaker Answers
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">Combined passing yards</p>
            <p className="font-bebas text-2xl text-cyan-300">{tiebreakerPassingYards ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">Combined rushing yards</p>
            <p className="font-bebas text-2xl text-cyan-300">{tiebreakerRushingYards ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GameCard ──────────────────────────────────────────────────────────────────

function GameCard({
  game,
  isSelected,
  isLocked,
  sandboxMode,
  confidence,
  maxConfidence,
  usedPoints,
  pickedTeam,
  isTiebreakerGame,
  onTeamClick,
  onAssignConfidence,
}: {
  game: PickEmGame;
  isSelected: boolean;
  isLocked: boolean;
  sandboxMode: boolean;
  confidence: number | undefined;
  maxConfidence: number;
  usedPoints: Set<number>;
  pickedTeam: string | null;
  isTiebreakerGame: boolean;
  onTeamClick: (teamId: string) => void;
  onAssignConfidence: (pts: number) => void;
}) {
  const isFinal = game.status === "final" || (game.status?.toUpperCase().includes("FINAL") ?? false);
  const isLive = !isFinal && (game.status === "in_progress" || game.status?.toUpperCase() === "STATUS_IN_PROGRESS");
  const isPostponed = !isFinal && game.status === "postponed";
  const isSuspended = !isFinal && game.status === "suspended";
  const isGameLocked = isSuspended || isLocked;

  function teamSide(team: PickEmGame["awayTeam"], side: "away" | "home") {
    const isHome = side === "home";
    const isPicked = pickedTeam === team.id;
    const score = isHome ? game.homeScore : game.awayScore;

    return (
      <button
        type="button"
        disabled={isGameLocked}
        onClick={() => onTeamClick(team.id)}
        className={cn(
          "flex-1 flex items-center gap-2 p-3 md:p-4 transition-all select-none min-w-0",
          isHome ? "flex-row-reverse" : "",
          isPicked ? "bg-cyan-500/12" : !isGameLocked ? "hover:bg-muted/20 active:bg-muted/30" : "",
          isGameLocked ? "cursor-default" : "cursor-pointer",
        )}
      >
        <div className={cn(
          "shrink-0 rounded-full p-1 shadow-sm transition-all",
          isPicked ? "bg-white ring-2 ring-cyan-400/60" : "bg-white/90",
        )}>
          <img
            src={teamLogoSrc(team)}
            alt={team.name}
            className="w-10 h-10 md:w-12 md:h-12 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <div className={cn("min-w-0 flex-1", isHome ? "text-right" : "text-left")}>
          <div className={cn(
            "font-bebas text-base md:text-xl tracking-wide leading-none truncate transition-colors",
            isPicked ? "text-cyan-200" : "text-foreground",
          )}>
            {team.name}
          </div>
          {(isFinal || isLive) && score != null ? (
            <div className={cn("font-bebas text-2xl leading-none", isPicked ? "text-cyan-300" : "text-foreground/70")}>
              {score}
            </div>
          ) : (
            <div className="text-[10px] md:text-xs text-muted-foreground">
              {isHome ? "Home" : "Away"}
            </div>
          )}
          {isPicked && (
            <div className={cn(
              "text-[9px] font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-0.5 mt-0.5",
              isHome ? "justify-end" : "",
            )}>
              <Check className="w-2.5 h-2.5" /> My Pick
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className={cn(
      "rounded-lg border-2 transition-all overflow-hidden",
      isTiebreakerGame
        ? isSelected
          ? "border-yellow-500/70 bg-yellow-500/5 shadow-[0_0_12px_rgba(234,179,8,0.15)]"
          : "border-yellow-500/40 bg-yellow-500/3"
        : isSuspended
          ? "border-border/30 bg-card/30 opacity-50"
          : isLive
            ? "border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
            : isSelected
              ? "border-cyan-500/60 bg-cyan-500/5"
              : "border-border/40 bg-card/50",
      !isSuspended && isLocked && !isSelected && !isLive && "opacity-50",
    )}>
      {isTiebreakerGame && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/30">
          <Trophy className="w-3 h-3 text-yellow-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">
            Tiebreaker Game
          </span>
        </div>
      )}

      {isLive && !isTiebreakerGame && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border-b border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
            LIVE{game.liveDetail ? ` · ${game.liveDetail}` : ""}
          </span>
        </div>
      )}

      <div className="flex items-stretch divide-x divide-border/20">
        {teamSide(game.awayTeam, "away")}

        <div className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 shrink-0 min-w-[52px] md:min-w-[60px]">
          {isFinal ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none text-center">
              Final
            </span>
          ) : isSuspended ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-orange-500/20 text-orange-400 border-orange-500/40 leading-none">
              SUSP
            </span>
          ) : isPostponed ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/40 leading-none">
              PPD
            </span>
          ) : isLive ? (
            <span className="text-[10px] font-bold text-red-400">vs</span>
          ) : (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap text-center leading-tight">
              {formatTimeEt(game.startTime)}
            </span>
          )}
          {isSelected ? (
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
              isTiebreakerGame ? "bg-yellow-500/20 border-yellow-400" : "bg-cyan-500/20 border-cyan-400",
            )}>
              <Check className={cn("w-3 h-3", isTiebreakerGame ? "text-yellow-300" : "text-cyan-300")} />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
          )}
        </div>

        {teamSide(game.homeTeam, "home")}
      </div>

      {isSelected && (
        <div className="px-3 pb-3 md:px-5 md:pb-4 border-t border-cyan-500/20 pt-2.5">
          <p className="text-[10px] md:text-xs text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">
            Confidence points
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: maxConfidence }, (_, i) => i + 1).map((pts) => {
              const taken = usedPoints.has(pts) && confidence !== pts;
              return (
                <button
                  key={pts}
                  type="button"
                  disabled={isLocked || taken}
                  onClick={() => onAssignConfidence(pts)}
                  className={cn(
                    "w-8 h-8 md:w-9 md:h-9 rounded-md text-sm font-bold border-2 transition-all",
                    confidence === pts
                      ? "bg-cyan-500 border-cyan-400 text-white"
                      : taken
                        ? "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                        : "border-border/50 text-muted-foreground hover:border-cyan-500/50 hover:text-cyan-400",
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

// ── Commissioner Panel ────────────────────────────────────────────────────────

interface NflConfidenceWeeklyCommissionerPanelProps {
  poolId: number;
  inviteCode: string | null;
  poolName: string;
  poolDescription: string | null;
  currentWeek: number;
  sandboxMode: boolean;
  sandboxWeek: number;
  isSuperAdmin: boolean;
}

export function NflConfidenceWeeklyCommissionerPanel({
  poolId,
  inviteCode,
  poolName,
  poolDescription,
  currentWeek,
  sandboxMode,
  sandboxWeek: initialSandboxWeek,
  isSuperAdmin,
}: NflConfidenceWeeklyCommissionerPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("auth_token");
  const [name, setName] = useState(poolName);
  const [desc, setDesc] = useState(poolDescription ?? "");
  const [localSandboxMode, setLocalSandboxMode] = useState(sandboxMode);
  const [localSandboxWeek, setLocalSandboxWeek] = useState(initialSandboxWeek);

  useEffect(() => { setLocalSandboxMode(sandboxMode); }, [sandboxMode]);
  useEffect(() => { setLocalSandboxWeek(initialSandboxWeek); }, [initialSandboxWeek]);
  const [togglingsandbox, setTogglingSandbox] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ week: number; graded: number } | null>(null);

  async function handleToggleSandbox(enabled: boolean) {
    setTogglingSandbox(true);
    try {
      const res = await fetch(`/api/admin/pools/${poolId}/sandbox-mode`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sandboxMode: enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setLocalSandboxMode(enabled);
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
      queryClient.invalidateQueries({ queryKey: ["nfl-confidence-weekly-games", poolId] });
      toast({ title: `Sandbox mode ${enabled ? "enabled" : "disabled"}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to toggle sandbox", description: (err as Error).message });
    } finally {
      setTogglingSandbox(false);
    }
  }

  async function handleLoadSandboxWeek() {
    try {
      const res = await fetch(`/api/pools/${poolId}/nfl-confidence-weekly/sandbox-week`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: localSandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
      queryClient.invalidateQueries({ queryKey: ["nfl-confidence-weekly-games", poolId] });
      toast({ title: `Week ${localSandboxWeek} loaded`, description: "Game slate updated." });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load week", description: (err as Error).message });
    }
  }

  async function handleSimulateGrading() {
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch(`/api/pools/${poolId}/nfl-confidence-weekly/simulate-grading`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: localSandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setSimResult({ week: data.week, graded: data.graded });
      toast({ title: "Grading complete", description: `${data.graded} picks graded for week ${data.week}.` });
      queryClient.invalidateQueries({ queryKey: ["nfl-confidence-weekly-picks", poolId] });
    } catch (err) {
      toast({ variant: "destructive", title: "Simulation failed", description: (err as Error).message });
    } finally {
      setSimulating(false);
    }
  }

  const updatePool = useUpdatePool({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
        toast({ title: "Settings saved" });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to save settings" });
      },
    },
  });

  function handleCopy() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      toast({ title: "Invite code copied!" });
    });
  }

  function handleCopyLink() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`).then(() => {
      toast({ title: "Invite link copied!", description: "Share it with anyone to let them join." });
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Invite Code
          </CardTitle>
          <CardDescription>Share this code so players can join your pool.</CardDescription>
        </CardHeader>
        <CardContent>
          {inviteCode ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
                {inviteCode}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={handleCopy} className="font-bebas text-xl tracking-wider">
                  <Copy className="w-5 h-5 mr-2" /> Copy Code
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                  onClick={handleCopyLink}
                >
                  <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No invite code set.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" /> Pool Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label className="font-bebas text-lg tracking-wide">Pool Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background/50" placeholder="Pool name" />
          </div>
          <div className="grid gap-2">
            <Label className="font-bebas text-lg tracking-wide">Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-background/50 resize-none" rows={3} placeholder="Optional description" />
          </div>
          <Button
            onClick={() => updatePool.mutate({ poolId, data: { name, description: desc } } as any)}
            disabled={updatePool.isPending}
            className="font-bebas text-lg tracking-wider"
          >
            {updatePool.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" /> Current Week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-6 py-4 text-center min-w-[96px]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Current Week</p>
              <p className="font-bebas text-4xl text-cyan-300 leading-none">{currentWeek}</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Each week resets — picks from the previous week are complete and a fresh slate begins.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-4 py-3">
            <Trophy className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300/80 leading-relaxed">
              <span className="font-semibold text-yellow-300">Tiebreaker:</span>{" "}
              The last game on the weekly slate. If players are tied on weekly confidence points, the closest prediction of combined QB passing yards wins.
            </p>
          </div>
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card className="border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,rgba(10,14,26,1)_100%)]">
          <CardHeader>
            <CardTitle className="font-bebas text-2xl tracking-wide text-yellow-400 flex items-center gap-2">
              <Zap className="w-5 h-5" /> Sandbox Mode
            </CardTitle>
            <CardDescription className="text-muted-foreground/80">
              Use the 2025 NFL schedule for testing without waiting for live games.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <div>
                <p className="font-semibold text-sm text-yellow-300">Sandbox Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use 2025 NFL schedule for testing</p>
              </div>
              <Switch
                checked={localSandboxMode}
                onCheckedChange={handleToggleSandbox}
                disabled={togglingsandbox}
                className="data-[state=checked]:bg-yellow-500"
              />
            </div>

            {localSandboxMode && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label className="font-bebas text-lg tracking-wide text-yellow-300/80">Sandbox Week</Label>
                  <Select value={String(localSandboxWeek)} onValueChange={(v) => setLocalSandboxWeek(Number(v))}>
                    <SelectTrigger className="w-[180px] bg-background/50 border-yellow-500/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                        <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleLoadSandboxWeek} className="font-bebas text-lg tracking-wider bg-yellow-600 hover:bg-yellow-500 text-black">
                    <Zap className="w-4 h-4 mr-1.5" /> Load Week
                  </Button>
                  <Button
                    onClick={handleSimulateGrading}
                    disabled={simulating}
                    variant="outline"
                    className="font-bebas text-lg tracking-wider border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
                  >
                    <BarChart3 className="w-4 h-4 mr-1.5" />
                    {simulating ? "Grading…" : "Simulate Grading"}
                  </Button>
                  {simResult && (
                    <span className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {simResult.graded} picks graded for week {simResult.week}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  "Load Week" sets the pool's active week. "Simulate Grading" scores all pending picks against the 2025 sandbox results.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NflConfidenceWeeklyView({ poolId, currentWeek }: NflConfidenceWeeklyViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pickedTeams, setPickedTeams] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tbPassingYards, setTbPassingYards] = useState("");
  const [tbRushingYards, setTbRushingYards] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultsWeek, setResultsWeek] = useState<number | null>(null);

  const myPicksKey = ["nfl-confidence-weekly-picks", poolId];

  const { data: myPicksData, isLoading: picksLoading } = useQuery<SubmittedPicksResponse>({
    queryKey: myPicksKey,
    queryFn: () => authedFetch<SubmittedPicksResponse>(`/api/pools/${poolId}/nfl-confidence-weekly/picks`),
    retry: false,
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: slate, isLoading: slateLoading } = useQuery<{ week: number; games: PickEmGame[]; sandboxMode: boolean }>({
    queryKey: ["nfl-confidence-weekly-games", poolId],
    queryFn: () => authedFetch<{ week: number; games: PickEmGame[]; sandboxMode: boolean }>(`/api/pools/${poolId}/nfl-confidence-weekly/games`),
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const { data: leaderboardData } = useQuery<WeeklyLeaderboardResponse>({
    queryKey: ["nfl-confidence-weekly-leaderboard", poolId, currentWeek ?? 1],
    queryFn: () => authedFetch<WeeklyLeaderboardResponse>(`/api/pools/${poolId}/nfl-confidence-weekly/leaderboard?week=${currentWeek ?? 1}`),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const leaderboardPlayers = leaderboardData?.players ?? [];
  const isWeekFullyGraded = leaderboardData?.actualPassingYards != null;
  const weekWinner = isWeekFullyGraded && leaderboardPlayers.length > 0 ? leaderboardPlayers[0] : null;

  const games: PickEmGame[] = slate?.games ?? [];
  const maxConfidence = games.length;

  const existingPicks = myPicksData?.picks ?? [];
  const hasPicks = existingPicks.length > 0;

  const firstGameStart = useMemo(() => {
    if (games.length === 0) return Infinity;
    const times = games.map((g) => new Date(g.startTime).getTime()).filter((t) => !isNaN(t));
    return times.length > 0 ? Math.min(...times) : Infinity;
  }, [games]);

  const isLocked = !slate?.sandboxMode && Date.now() >= firstGameStart;

  const usedPoints = useMemo(() => new Set(Object.values(confidence)), [confidence]);

  const pickedCount = Object.keys(pickedTeams).length;
  const allPicked = pickedCount === maxConfidence && maxConfidence > 0;
  const allReady = allPicked && games.every((g) => confidence[g.id] !== undefined);

  const tiebreakerGameId = games.at(-1)?.id ?? null;

  function handleTeamClick(gameId: string, teamId: string) {
    if (isLocked) return;
    if (pickedTeams[gameId] === teamId) {
      setPickedTeams((prev) => { const p = { ...prev }; delete p[gameId]; return p; });
      setConfidence((prev) => { const c = { ...prev }; delete c[gameId]; return c; });
    } else {
      setPickedTeams((prev) => ({ ...prev, [gameId]: teamId }));
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

  function handleSubmitClick() {
    const unpicked = games.filter((g) => !pickedTeams[g.id]);
    if (unpicked.length > 0) {
      toast({ title: `${unpicked.length} game${unpicked.length === 1 ? "" : "s"} need a pick`, description: "Pick a winner for every game on the slate.", variant: "destructive" });
      return;
    }
    if (!allReady) {
      toast({ title: "Assign all confidence points", description: `Each game needs a point value from 1–${maxConfidence}.`, variant: "destructive" });
      return;
    }
    setShowTiebreaker(true);
  }

  async function handleFinalSubmit() {
    if (!tbPassingYards || !tbRushingYards) {
      toast({ title: "Tiebreaker required", description: "Enter both tiebreaker values.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const picks = games.map((g) => {
        const pickedTeamId = pickedTeams[g.id] ?? "";
        const pickedTeam = pickedTeamId === g.homeTeam.id ? g.homeTeam : g.awayTeam;
        return { gameId: g.id, pickedTeamId, pickedTeamName: pickedTeam?.name ?? pickedTeamId, confidencePoints: confidence[g.id] };
      });
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/nfl-confidence-weekly/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ picks, tiebreakerPassingYards: parseInt(tbPassingYards, 10), tiebreakerRushingYards: parseInt(tbRushingYards, 10) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Submission failed");
      }
      setShowTiebreaker(false);
      toast({ title: "Picks submitted!", description: "Good luck. Picks are now locked." });
      queryClient.invalidateQueries({ queryKey: myPicksKey });
    } catch (err) {
      toast({ title: "Submission failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (picksLoading || slateLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (hasPicks) {
    return (
      <div className="space-y-4">
        <LockedPicksView
          picks={myPicksData!.picks}
          tiebreakerPassingYards={myPicksData?.tiebreakerPassingYards ?? null}
          tiebreakerRushingYards={myPicksData?.tiebreakerRushingYards ?? null}
        />
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-bebas text-2xl tracking-wide mb-1">No Games This Week</p>
        <p className="text-sm">Check back when the NFL weekly slate is available.</p>
      </div>
    );
  }

  const missingPicks = games.filter((g) => !pickedTeams[g.id]).length;
  const missingPoints = games.filter((g) => confidence[g.id] === undefined).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Zap className="w-6 h-6 text-cyan-400" />
            NFL Confidence — Week {currentWeek ?? "?"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pick every game, assign confidence points 1–{maxConfidence}. Highest weekly total wins.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "text-sm font-bold px-3 py-1 rounded-full border",
            allPicked
              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
              : "bg-muted/50 text-muted-foreground border-border/40",
          )}>
            {pickedCount} / {maxConfidence} picked
          </div>
          {isLocked && (
            <span className="flex items-center gap-1 text-xs text-destructive font-semibold bg-destructive/10 border border-destructive/20 px-2 py-1 rounded-full">
              <Lock className="w-3 h-3" /> Picks Locked
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-4 py-2.5">
        <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
        <p className="text-xs text-yellow-300/80">
          The <span className="font-semibold text-yellow-300">last game</span> on the slate is always the tiebreaker.
          If tied at week's end, closest prediction of combined QB passing yards wins.
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-[9px] px-1.5 py-0.5">TIEBREAKER</Badge>
          Last game of the week
        </span>
      </div>

      <div className="space-y-3">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            isSelected={!!pickedTeams[game.id]}
            isLocked={isLocked}
            sandboxMode={slate?.sandboxMode ?? false}
            confidence={confidence[game.id]}
            maxConfidence={maxConfidence}
            usedPoints={usedPoints}
            pickedTeam={pickedTeams[game.id] ?? null}
            isTiebreakerGame={game.id === tiebreakerGameId}
            onTeamClick={(teamId) => handleTeamClick(game.id, teamId)}
            onAssignConfidence={(pts) => assignConfidence(game.id, pts)}
          />
        ))}
      </div>

      <Button
        onClick={handleSubmitClick}
        disabled={isLocked || !allReady}
        className="w-full font-bebas text-xl tracking-wider h-12 bg-cyan-600 hover:bg-cyan-500 text-white"
      >
        {isLocked
          ? "Picks Locked"
          : missingPicks > 0
            ? `Pick ${missingPicks} more game${missingPicks === 1 ? "" : "s"}`
            : missingPoints > 0
              ? "Assign all confidence points"
              : "Submit Picks"}
      </Button>

      <Dialog open={showTiebreaker} onOpenChange={setShowTiebreaker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">Tiebreaker</DialogTitle>
            {(() => {
              const tbGame: TiebreakerGame | null =
                myPicksData?.tiebreakerGame ??
                (games.length > 0
                  ? {
                      awayTeam: { abbreviation: games.at(-1)!.awayTeam.abbreviation, name: games.at(-1)!.awayTeam.name },
                      homeTeam: { abbreviation: games.at(-1)!.homeTeam.abbreviation, name: games.at(-1)!.homeTeam.name },
                      startTime: games.at(-1)!.startTime,
                    }
                  : null);
              const gameTime = tbGame?.startTime
                ? new Date(tbGame.startTime).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/New_York",
                    hour12: true,
                  }) + " ET"
                : null;
              return (
                <DialogDescription className="space-y-1">
                  {tbGame && (
                    <span className="block text-sm font-semibold text-foreground">
                      {tbGame.awayTeam.name} @ {tbGame.homeTeam.name}
                      {gameTime && <span className="ml-2 text-muted-foreground font-normal">· {gameTime}</span>}
                    </span>
                  )}
                  <span className="block">
                    If tied at week's end, the player closest to each actual number wins. Both answers are locked with your picks.
                  </span>
                </DialogDescription>
              );
            })()}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tb-passing-w">Combined passing yards — both QBs</Label>
              <Input id="tb-passing-w" type="number" min="0" placeholder="e.g. 540" value={tbPassingYards} onChange={(e) => setTbPassingYards(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-rushing-w">Combined rushing yards — both teams</Label>
              <Input id="tb-rushing-w" type="number" min="0" placeholder="e.g. 210" value={tbRushingYards} onChange={(e) => setTbRushingYards(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowTiebreaker(false)} disabled={submitting}>Back</Button>
            <Button
              onClick={handleFinalSubmit}
              disabled={submitting || !tbPassingYards || !tbRushingYards}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {submitting ? "Submitting…" : "Lock In Picks"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resultsWeek !== null} onOpenChange={(open) => { if (!open) setResultsWeek(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">Weekly Grid</DialogTitle>
            <DialogDescription>Pick results for Week {resultsWeek ?? ""}</DialogDescription>
          </DialogHeader>
          {resultsWeek !== null && <NflConfidenceWeeklyGrid poolId={poolId} initialWeek={resultsWeek} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
