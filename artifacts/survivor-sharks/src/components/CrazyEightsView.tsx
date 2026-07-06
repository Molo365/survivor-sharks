import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Lock, Dice5, AlertCircle, Trophy, Check, X, Clock, Snowflake } from "lucide-react";
import { CrazyEightsGrid } from "@/components/CrazyEightsGrid";

const MAX_PICKS = 8;

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrazyEightsViewProps {
  poolId: number;
  sport: string;
}

interface PitcherInfo {
  name?: string;
  wins?: number | null;
  losses?: number | null;
  era?: number | null;
}

interface SlateTeam {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface SlateGame {
  id: string;
  startTime: string;
  status: string;
  awayTeam: SlateTeam;
  homeTeam: SlateTeam;
  awayScore: number | null;
  homeScore: number | null;
  awayPitcher?: PitcherInfo | null;
  homePitcher?: PitcherInfo | null;
  liveDetail?: string | null;
}

interface TiebreakerGame {
  awayTeam: { abbreviation: string; name: string };
  homeTeam: { abbreviation: string; name: string };
  startTime: string;
}

interface SlateResponse {
  sport: "mlb" | "nhl";
  games: SlateGame[];
  gameDate?: string;
  weekLabel?: string;
  satDate?: string;
  sunDate?: string;
  tiebreakerGame?: TiebreakerGame | null;
  sandboxMode?: boolean;
}

interface SubmittedPick {
  gameId: string;
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string;
  homeTeam: SlateTeam;
  awayTeam: SlateTeam;
  homeScore: number | null;
  awayScore: number | null;
  startTime: string;
  status: string;
}

interface SubmittedPicksResponse {
  picks: SubmittedPick[];
  tiebreakerRuns?: number | null;
  tiebreakerStrikeouts?: number | null;
  tiebreakerShotsOnGoal?: number | null;
  tiebreakerPenaltyMinutes?: number | null;
  tiebreakerGame: TiebreakerGame | null;
}

interface YesterdayWinnerResponse {
  date: string;
  hasResults: boolean;
  winners: { userId: number; username: string; displayName: string | null; confidencePoints: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

function getTodayEt(): string {
  return new Date(Date.now() - FIVE_HOURS_MS).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function getLastNhlSat(): string {
  const today = getTodayEt();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun,1=Mon...,6=Sat
  const daysBack = (dow + 1) % 7; // Sat→0, Sun→1, Mon→2...
  const satDt = new Date(dt.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return satDt.toISOString().slice(0, 10);
}

function teamLogoSrc(team: SlateTeam, sport = "mlb") {
  return team.logoUrl ?? `https://a.espncdn.com/i/teamlogos/${sport}/500/${team.abbreviation.toLowerCase()}.png`;
}

function pitcherLine(pitcher: PitcherInfo | null | undefined): string | null {
  if (!pitcher?.name) return null;
  const rec = pitcher.wins != null && pitcher.losses != null ? `(${pitcher.wins}-${pitcher.losses})` : null;
  const era = pitcher.era != null ? `${pitcher.era} ERA` : null;
  return [pitcher.name, rec, era].filter(Boolean).join(" ");
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

// ── Locked picks view ────────────────────────────────────────────────────────

function LockedPickRow({ pick, sport }: { pick: SubmittedPick; sport: string }) {
  const isFinal = pick.status === "final";
  const isLive = pick.status === "in_progress";
  const isPostponed = pick.status === "postponed";

  function teamSide(team: SlateTeam, side: "away" | "home", score: number | null) {
    const isPicked = pick.pickedTeamId === team.id;
    const isCorrect = isPicked && pick.result === "correct";
    const isWrong = isPicked && pick.result === "incorrect";
    const isHome = side === "home";

    const logo = (
      <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
        <img
          src={teamLogoSrc(team, sport)}
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
      <div className={cn(
        "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center font-bebas text-xl md:text-2xl border-2",
        pick.result === "correct"   ? "bg-green-500/15 border-green-500/40 text-green-300" :
        pick.result === "incorrect" ? "bg-red-500/15   border-red-500/40   text-red-300"   :
                                 "bg-purple-500/15 border-purple-500/40 text-purple-300",
      )}>
        {pick.confidencePoints ?? "—"}
      </div>

      <div className={cn(
        "flex-1 shark-card rounded-xl border overflow-hidden relative",
        isLive
          ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]"
          : "border-border/40",
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

function LockedPicksView({
  picks,
  sport,
  tiebreakerRuns,
  tiebreakerStrikeouts,
  tiebreakerShotsOnGoal,
  tiebreakerPenaltyMinutes,
}: {
  picks: SubmittedPick[];
  sport: string;
  tiebreakerRuns: number | null;
  tiebreakerStrikeouts: number | null;
  tiebreakerShotsOnGoal: number | null;
  tiebreakerPenaltyMinutes: number | null;
}) {
  const sorted = [...picks].sort((a, b) => (b.confidencePoints ?? 0) - (a.confidencePoints ?? 0));
  const isNhl = sport === "nhl";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-400" />
            {isNhl ? "Your Hit the Ice! Picks" : "Your Crazy 8's Picks"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isNhl ? "Weekend picks are submitted and locked." : "Today's picks are submitted and locked."}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-full">
          <Lock className="w-3 h-3" /> Locked
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
        <Trophy className="w-5 h-5 text-purple-400 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Picks submitted!</p>
          <p className="text-xs text-muted-foreground">
            {isNhl ? "Your Hit the Ice! picks are locked in. Good luck this weekend!" : "Your Crazy 8's picks are locked in. Good luck!"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
          8 Picks · Sorted by confidence
        </p>
        <div className="space-y-2">
          {sorted.map((pick) => (
            <LockedPickRow key={pick.gameId} pick={pick} sport={sport} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
          Tiebreaker Answers
        </p>
        {isNhl ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground/70 mb-0.5">Total shots on goal</p>
              <p className="font-bebas text-2xl text-purple-300">{tiebreakerShotsOnGoal ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70 mb-0.5">Total penalty minutes</p>
              <p className="font-bebas text-2xl text-purple-300">{tiebreakerPenaltyMinutes ?? "—"}</p>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

// ── GameCard (selection UI) ──────────────────────────────────────────────────

function GameCard({
  game,
  sport,
  isSelected,
  isLocked,
  gameHasStarted,
  confidence,
  usedPoints,
  pickedTeam,
  onTeamClick,
  onAssignConfidence,
}: {
  game: SlateGame;
  sport: string;
  isSelected: boolean;
  isLocked: boolean;
  gameHasStarted: boolean;
  confidence: number | undefined;
  usedPoints: Set<number>;
  pickedTeam: string | null;
  onTeamClick: (teamId: string) => void;
  onAssignConfidence: (pts: number) => void;
}) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isPostponed = game.status === "postponed";
  const isSuspended = game.status === "suspended";
  const isDisabled = isSuspended || (isLocked && !isSelected) || (gameHasStarted && !isSelected);
  const isNhl = sport === "nhl";

  const awayPitcher = isNhl ? null : pitcherLine(game.awayPitcher);
  const homePitcher = isNhl ? null : pitcherLine(game.homePitcher);

  function teamSide(team: SlateTeam, side: "away" | "home") {
    const isHome = side === "home";
    const isPicked = pickedTeam === team.id;
    const score = isHome ? game.homeScore : game.awayScore;
    const pitcher = isHome ? homePitcher : awayPitcher;

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => onTeamClick(team.id)}
        className={cn(
          "flex-1 flex items-center gap-2 p-3 md:p-4 transition-all select-none min-w-0",
          isHome ? "flex-row-reverse" : "",
          isPicked
            ? "bg-purple-500/12"
            : !isDisabled ? "hover:bg-muted/20 active:bg-muted/30" : "",
          isDisabled ? "cursor-default" : "cursor-pointer",
        )}
      >
        <div className={cn(
          "shrink-0 rounded-full p-1 shadow-sm transition-all",
          isPicked ? "bg-white ring-2 ring-purple-400/60" : "bg-white/90",
        )}>
          <img
            src={teamLogoSrc(team, sport)}
            alt={team.name}
            className="w-8 h-8 md:w-10 md:h-10 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        <div className={cn("min-w-0 flex-1", isHome ? "text-right" : "text-left")}>
          <div className={cn(
            "font-bebas text-base md:text-xl tracking-wide leading-none truncate transition-colors",
            isPicked ? "text-purple-200" : "text-foreground",
          )}>
            {team.name}
          </div>
          {(isFinal || isLive) && score != null ? (
            <div className={cn(
              "font-bebas text-2xl leading-none",
              isPicked ? "text-purple-300" : "text-foreground/70",
            )}>
              {score}
            </div>
          ) : (
            <>
              <div className="text-[10px] md:text-xs text-muted-foreground">
                {isHome ? "Home" : "Away"}
              </div>
              {pitcher && (
                <div className={cn(
                  "text-[9px] md:text-[11px] text-muted-foreground/70 leading-snug mt-0.5 truncate",
                  isHome ? "max-w-[120px] md:max-w-none" : "max-w-[120px] md:max-w-none",
                )}>
                  {pitcher}
                </div>
              )}
            </>
          )}
          {isPicked && (
            <div className={cn(
              "text-[9px] font-bold uppercase tracking-widest text-purple-400 flex items-center gap-0.5 mt-0.5",
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
      isSuspended
        ? "border-border/30 bg-card/30 opacity-50"
        : isLive
          ? "border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
          : isSelected
            ? "border-purple-500/60 bg-purple-500/5"
            : "border-border/40 bg-card/50",
      !isSuspended && isLocked && !isSelected && !isLive && "opacity-50",
    )}>
      {isLive && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border-b border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
            LIVE{game.liveDetail ? ` · ${game.liveDetail}` : ""}
          </span>
        </div>
      )}

      <div className="flex items-stretch divide-x divide-border/20">
        {teamSide(game.awayTeam, "away")}

        <div className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 shrink-0 min-w-[72px] md:min-w-[88px]">
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
            <span className="text-[11px] md:text-xs text-muted-foreground font-semibold whitespace-nowrap text-center leading-tight">
              {formatTimeEt(game.startTime)}
            </span>
          )}
          {isSelected ? (
            <div className="w-5 h-5 rounded-full bg-purple-500/20 border-2 border-purple-400 flex items-center justify-center">
              <Check className="w-3 h-3 text-purple-300" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
          )}
        </div>

        {teamSide(game.homeTeam, "home")}
      </div>

      {isSelected && (
        <div className="px-3 pb-3 md:px-5 md:pb-4 border-t border-purple-500/20 pt-2.5">
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
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CrazyEightsView({ poolId, sport }: CrazyEightsViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNhl = sport === "nhl";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [pickedTeams, setPickedTeams] = useState<Record<string, string>>({});
  const [showTiebreaker, setShowTiebreaker] = useState(false);

  // MLB tiebreaker
  const [tbRuns, setTbRuns] = useState("");
  const [tbStrikeouts, setTbStrikeouts] = useState("");

  // NHL tiebreaker
  const [tbShots, setTbShots] = useState("");
  const [tbPim, setTbPim] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [resultsDate, setResultsDate] = useState<string | null>(null);

  const hintKey = `crazy-eights-hint-dismissed-${poolId}-${user?.id ?? "guest"}`;
  const [showHint, setShowHint] = useState<boolean>(() => {
    try { return localStorage.getItem(hintKey) !== "1"; } catch { return false; }
  });
  function dismissHint() {
    try { localStorage.setItem(hintKey, "1"); } catch { /* ignore */ }
    setShowHint(false);
  }

  const hintKeyNhl = `hittheice-hint-dismissed-${poolId}-${user?.id ?? "guest"}`;
  const [showHintNhl, setShowHintNhl] = useState<boolean>(() => {
    try { return localStorage.getItem(hintKeyNhl) !== "1"; } catch { return false; }
  });
  function dismissHintNhl() {
    try { localStorage.setItem(hintKeyNhl, "1"); } catch { /* ignore */ }
    setShowHintNhl(false);
  }

  // For MLB: yesterday; for NHL: Saturday of the most recent past weekend
  const priorPeriodDate = useMemo(() => {
    if (!isNhl) return offsetDate(getTodayEt(), -1);
    return getLastNhlSat();
  }, [isNhl]);

  const { data: yesterdayWinner } = useQuery<YesterdayWinnerResponse>({
    queryKey: ["crazy-eights-yesterday-winner", poolId, priorPeriodDate],
    queryFn: () => authedFetch<YesterdayWinnerResponse>(`/api/pools/${poolId}/crazy-eights/yesterday-winner?date=${priorPeriodDate}`),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const myPicksKey = ["crazy-eights-picks", poolId];

  const { data: myPicksData, isLoading: picksLoading } = useQuery<SubmittedPicksResponse>({
    queryKey: myPicksKey,
    queryFn: () => authedFetch<SubmittedPicksResponse>(`/api/pools/${poolId}/crazy-eights/picks`),
    retry: false,
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: slateData, isLoading: slateLoading } = useQuery<SlateResponse>({
    queryKey: ["crazy-eights-slate", poolId],
    queryFn: () => authedFetch<SlateResponse>(`/api/pools/${poolId}/crazy-eights/slate`),
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const games: SlateGame[] = slateData?.games ?? [];
  const sandboxMode = slateData?.sandboxMode ?? false;

  const existingPicks = myPicksData?.picks ?? [];
  const hasPicks = existingPicks.length > 0;

  const earliestSelectedStart = useMemo(() => {
    const selected = games.filter((g) => selectedIds.includes(g.id));
    if (selected.length === 0) return Infinity;
    const times = selected.map((g) => new Date(g.startTime).getTime()).filter((t) => !isNaN(t));
    return times.length > 0 ? Math.min(...times) : Infinity;
  }, [games, selectedIds]);

  const isLocked = !sandboxMode && Date.now() >= earliestSelectedStart;

  const usedPoints = useMemo(() => new Set(Object.values(confidence)), [confidence]);

  const allReady =
    selectedIds.length === MAX_PICKS &&
    selectedIds.every((id) => confidence[id] !== undefined) &&
    selectedIds.every((id) => pickedTeams[id] !== undefined);

  function handleTeamClick(gameId: string, teamId: string) {
    if (isLocked) return;
    if (selectedIds.includes(gameId)) {
      if (pickedTeams[gameId] === teamId) {
        setSelectedIds((prev) => prev.filter((id) => id !== gameId));
        setConfidence((prev) => { const c = { ...prev }; delete c[gameId]; return c; });
        setPickedTeams((prev) => { const p = { ...prev }; delete p[gameId]; return p; });
      } else {
        setPickedTeams((prev) => ({ ...prev, [gameId]: teamId }));
      }
    } else {
      if (selectedIds.length >= MAX_PICKS) {
        toast({ title: "8 games max", description: "Deselect a game before adding another.", variant: "destructive" });
        return;
      }
      setSelectedIds((prev) => [...prev, gameId]);
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
    if (isNhl) {
      if (!tbShots || !tbPim) {
        toast({ title: "Tiebreaker required", description: "Enter both shots on goal and penalty minutes.", variant: "destructive" });
        return;
      }
    } else {
      if (!tbRuns || !tbStrikeouts) {
        toast({ title: "Tiebreaker required", description: "Enter both tiebreaker values.", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const picks = selectedIds.map((id) => {
        const g = games.find(gm => gm.id === id);
        const teamId = pickedTeams[id] ?? "";
        const pickedTeamName = g
          ? (teamId === g.homeTeam.id ? g.homeTeam.abbreviation : g.awayTeam.abbreviation)
          : teamId;
        return { gameId: id, pickedTeam: teamId, pickedTeamName, confidencePoints: confidence[id] };
      });

      const token = localStorage.getItem("auth_token");
      const body = isNhl
        ? { picks, tiebreakerShotsOnGoal: parseInt(tbShots, 10), tiebreakerPenaltyMinutes: parseInt(tbPim, 10) }
        : { picks, tiebreakerRuns: parseInt(tbRuns, 10), tiebreakerStrikeouts: parseInt(tbStrikeouts, 10) };

      const res = await fetch(`/api/pools/${poolId}/crazy-eights/picks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(body),
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

  // ── Loading state ─────────────────────────────────────────────────────────

  if (picksLoading || slateLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // ── Locked view — picks already submitted ─────────────────────────────────

  if (hasPicks) {
    return (
      <LockedPicksView
        picks={existingPicks}
        sport={sport}
        tiebreakerRuns={myPicksData?.tiebreakerRuns ?? null}
        tiebreakerStrikeouts={myPicksData?.tiebreakerStrikeouts ?? null}
        tiebreakerShotsOnGoal={myPicksData?.tiebreakerShotsOnGoal ?? null}
        tiebreakerPenaltyMinutes={myPicksData?.tiebreakerPenaltyMinutes ?? null}
      />
    );
  }

  // ── No games ──────────────────────────────────────────────────────────────

  if (games.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-bebas text-2xl tracking-wide mb-1">
          {isNhl ? "No Weekend Games" : "No Games Today"}
        </p>
        <p className="text-sm">
          {isNhl
            ? "Check back when the weekend NHL slate is available."
            : "Check back when today's MLB slate is available."}
        </p>
      </div>
    );
  }

  // ── Open selection UI ─────────────────────────────────────────────────────

  const missingWinner = selectedIds.some((id) => !pickedTeams[id]);
  const missingPoints = selectedIds.length === MAX_PICKS && !selectedIds.every((id) => confidence[id] !== undefined);

  const tbGame: TiebreakerGame | null =
    myPicksData?.tiebreakerGame ??
    slateData?.tiebreakerGame ??
    (games.length > 0
      ? {
          awayTeam: { abbreviation: games.at(-1)!.awayTeam.abbreviation, name: games.at(-1)!.awayTeam.name },
          homeTeam: { abbreviation: games.at(-1)!.homeTeam.abbreviation, name: games.at(-1)!.homeTeam.name },
          startTime: games.at(-1)!.startTime,
        }
      : null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            {isNhl ? <Snowflake className="w-6 h-6 text-cyan-400" /> : <Dice5 className="w-6 h-6 text-purple-400" />}
            {isNhl
              ? `Hit the Ice! — ${slateData?.weekLabel ?? "This Weekend"}`
              : "Crazy 8's — Today's Slate"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select 8 games, pick a winner for each, and assign confidence points 1–8.
          </p>
          {!isLocked && !hasPicks && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Tip: tap a selected team again to remove that pick.
            </p>
          )}
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

      {/* Prior period winner banner */}
      {yesterdayWinner?.hasResults && yesterdayWinner.winners.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3">
          <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-yellow-200">
              {isNhl ? "Last Weekend's" : "Yesterday's"} Winner{yesterdayWinner.winners.length > 1 ? "s" : ""}:
            </span>
            <span className="text-sm text-yellow-300">
              {yesterdayWinner.winners.map((w) => w.displayName || w.username).join(" & ")}
            </span>
            <span className="text-yellow-500/50 text-xs">·</span>
            <span className="text-sm text-yellow-400/70">
              {yesterdayWinner.winners[0].confidencePoints} pts
            </span>
          </div>
          <button
            type="button"
            onClick={() => setResultsDate(priorPeriodDate)}
            className="text-xs font-medium text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0 whitespace-nowrap"
          >
            View Results →
          </button>
        </div>
      )}

      {/* How-to hint — shown once per user per pool, dismissible */}
      {showHint && (
        <div className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 pr-10">
          <span className="text-xl leading-none mt-0.5">{isNhl ? "🏒" : "⚾"}</span>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground leading-snug">
              {isNhl ? "How Hit the Ice works" : "How Crazy 8's works"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
              Choose exactly 8 games, pick a winner for each, and assign confidence points 1–8 (no repeats). Higher numbers on correct picks = more points. Each game locks at first pitch{isNhl ? "/puck drop" : ""}. Enter a tiebreaker before submitting.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissHint}
            className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Dismiss hint"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hit the Ice intro hint — NHL only, shown once per user per pool, dismissible */}
      {isNhl && showHintNhl && (
        <div className="relative flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 pr-10">
          <span className="text-xl leading-none mt-0.5">🏒</span>
          <div className="min-w-0">
            <p className="text-sm text-amber-200/90 leading-snug">
              Hit the Ice works just like Crazy 8&apos;s — pick 8 NHL games each day, earn points for correct picks. Points accumulate Mon–Sun and the weekly leader wins. 🏒
            </p>
          </div>
          <button
            type="button"
            onClick={dismissHintNhl}
            className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Dismiss hint"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Game list */}
      <div className="space-y-3">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            sport={sport}
            isSelected={selectedIds.includes(game.id)}
            isLocked={isLocked}
            gameHasStarted={
              game.status === "in_progress" ||
              game.status === "final" ||
              (!sandboxMode && Date.now() >= new Date(game.startTime).getTime())
            }
            confidence={confidence[game.id]}
            usedPoints={usedPoints}
            pickedTeam={pickedTeams[game.id] ?? null}
            onTeamClick={(teamId) => handleTeamClick(game.id, teamId)}
            onAssignConfidence={(pts) => assignConfidence(game.id, pts)}
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
            {(() => {
              const gameTime = tbGame?.startTime
                ? new Date(tbGame.startTime).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit", timeZone: "America/New_York", hour12: true,
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
                    In case of a tie, your answers below will be used to determine the winner. The player closest to the actual number wins. Both answers are locked with your picks.
                  </span>
                </DialogDescription>
              );
            })()}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isNhl ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tb-shots">Total combined shots on goal</Label>
                  <Input
                    id="tb-shots"
                    type="number"
                    min="0"
                    placeholder="e.g. 58"
                    value={tbShots}
                    onChange={(e) => setTbShots(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tb-pim">Total combined penalty minutes</Label>
                  <Input
                    id="tb-pim"
                    type="number"
                    min="0"
                    placeholder="e.g. 12"
                    value={tbPim}
                    onChange={(e) => setTbPim(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowTiebreaker(false)} disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={handleFinalSubmit}
              disabled={submitting || (isNhl ? !tbShots || !tbPim : !tbRuns || !tbStrikeouts)}
              className="bg-purple-600 hover:bg-purple-500 text-white"
            >
              {submitting ? "Submitting…" : "Lock In Picks"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prior period results modal */}
      <Dialog open={!!resultsDate} onOpenChange={(open) => { if (!open) setResultsDate(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">
              {isNhl ? "Last Weekend's Grid" : "Yesterday's Grid"}
            </DialogTitle>
            <DialogDescription>
              {isNhl ? `Pick results for the weekend of ${resultsDate ?? ""}` : `Pick results for ${resultsDate ?? ""}`}
            </DialogDescription>
          </DialogHeader>
          {resultsDate && <CrazyEightsGrid poolId={poolId} sport={sport} initialDate={resultsDate} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
