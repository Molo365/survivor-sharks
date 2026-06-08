import { useState, useEffect } from "react";
import {
  useGetDailySchedule,
  useGetMyPicks,
  useSubmitPick,
  getGetMyPicksQueryKey,
  getGetDailyScheduleQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Lock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { invalidatePoolQueries } from "@/lib/queryUtils";

function formatGameTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }) + " ET";
}

function getTodayEt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function useDeadlineCountdown(deadline: string | null | undefined) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!deadline) return;

    function update() {
      const ms = new Date(deadline!).getTime() - Date.now();
      if (ms <= 0) {
        setTimeLeft("LOCKED");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      if (h > 0) setTimeLeft(`${h}h ${m}m`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);
    }

    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [deadline]);

  return timeLeft;
}

type TeamLike = {
  id: string;
  name: string;
  abbreviation?: string | null;
  logoUrl?: string | null;
  record?: string | null;
};

function TeamButton({
  team,
  isPicked,
  isSelectable,
  score,
  isWinner,
  isWrong,
  onClick,
}: {
  team: TeamLike;
  isPicked: boolean;
  isSelectable: boolean;
  score?: number | null;
  isWinner?: boolean;
  isWrong?: boolean;
  onClick: () => void;
}) {
  const showCorrect = isPicked && isWinner;
  const showWrong = isPicked && isWrong;

  return (
    <button
      onClick={onClick}
      disabled={!isSelectable}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 p-5 transition-all text-center w-full",
        isSelectable && !isPicked && "hover:bg-primary/5 cursor-pointer",
        isSelectable && isPicked && "cursor-default",
        !isSelectable && "cursor-default",
        showCorrect && "bg-green-500/10",
        showWrong && "bg-red-500/10",
        isPicked && !showCorrect && !showWrong && "bg-accent/10",
        isWinner && !isPicked && "bg-green-500/5",
        !isSelectable && !isPicked && !isWinner && "opacity-60",
      )}
    >
      {team.logoUrl ? (
        <div className={cn(
          "rounded-full p-1.5 shadow-sm shrink-0",
          showCorrect ? "bg-green-50" : showWrong ? "bg-red-50" : "bg-white/90",
        )}>
          <img src={team.logoUrl} alt={team.name} className="w-12 h-12 object-contain" />
        </div>
      ) : (
        <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center font-bebas text-lg text-muted-foreground shrink-0">
          {team.abbreviation?.slice(0, 3) ?? "?"}
        </div>
      )}

      <div>
        <div className={cn(
          "font-bebas text-xl tracking-wide",
          showCorrect ? "text-green-400" : showWrong ? "text-red-400" : isPicked ? "text-accent" : isWinner ? "text-green-400" : "text-foreground",
        )}>
          {team.abbreviation ?? team.name}
        </div>
        {team.record && (
          <div className="text-xs text-muted-foreground">{team.record}</div>
        )}
      </div>

      {score != null && (
        <div className={cn(
          "font-bebas text-3xl leading-none",
          showCorrect ? "text-green-400" : showWrong ? "text-red-400" : isWinner ? "text-green-400" : "text-foreground",
        )}>
          {score}
        </div>
      )}

      {showCorrect && (
        <span className="absolute top-2 right-2 bg-green-500 rounded-full p-0.5">
          <Check className="w-3 h-3 text-white" />
        </span>
      )}
      {showWrong && (
        <span className="absolute top-2 right-2 bg-red-500 rounded-full p-0.5">
          <X className="w-3 h-3 text-white" />
        </span>
      )}
      {isPicked && !showCorrect && !showWrong && (
        <span className="absolute top-2 right-2 bg-accent rounded-full p-0.5">
          <Check className="w-3 h-3 text-accent-foreground" />
        </span>
      )}
      {!isSelectable && !isPicked && (
        <span className="absolute top-2 right-2 text-muted-foreground/30">
          <Lock className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

export function DailyPickGrid({ poolId }: { poolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayEt());
  const todayEt = getTodayEt();
  const isToday = selectedDate === todayEt;

  const { data: schedule, isLoading: scheduleLoading } = useGetDailySchedule(
    poolId,
    { date: selectedDate },
    {
      query: {
        enabled: !!poolId,
        queryKey: getGetDailyScheduleQueryKey(poolId, { date: selectedDate }),
        refetchInterval: isToday ? 60_000 : false,
      },
    },
  );

  const { data: picks } = useGetMyPicks(poolId, {
    query: { enabled: !!poolId, queryKey: getGetMyPicksQueryKey(poolId) },
  });

  const submitPick = useSubmitPick();
  const countdown = useDeadlineCountdown(isToday ? schedule?.deadline : null);
  const dayPick = picks?.find(p => (p as any).pickDate === schedule?.date);
  const deadlinePassed = schedule?.deadlinePassed ?? false;
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);

  useEffect(() => {
    setPendingTeamId(null);
  }, [selectedDate]);

  const currentPickId = submitPick.isPending ? pendingTeamId : (dayPick?.teamId ?? null);

  function handlePickTeam(teamId: string, teamName: string, teamLogoUrl: string) {
    if (deadlinePassed) return;
    setPendingTeamId(teamId);
    submitPick.mutate(
      { poolId, data: { teamId, teamName, teamLogoUrl } },
      {
        onSuccess: () => {
          void invalidatePoolQueries(queryClient, poolId);
          toast({ title: "Pick saved!", description: `${teamName} locked in for today.` });
          setPendingTeamId(null);
        },
        onError: (err: any) => {
          setPendingTeamId(null);
          toast({
            variant: "destructive",
            title: "Pick failed",
            description: err?.response?.data?.error ?? err?.message ?? "Please try again.",
          });
        },
      },
    );
  }

  if (scheduleLoading) return <Skeleton className="h-[400px] w-full" />;
  if (!schedule) return null;

  return (
    <div className="space-y-6">
      {/* ── Date navigation ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSelectedDate(d => offsetDate(d, -1))}
          className="p-2 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
          <span className="font-bebas text-2xl tracking-wide text-primary leading-none text-center truncate w-full">
            {schedule.label}
          </span>
          {isToday ? (
            <span className="text-[10px] text-primary/50 uppercase tracking-widest font-medium">Today</span>
          ) : (
            <button
              onClick={() => setSelectedDate(todayEt)}
              className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors uppercase tracking-widest font-medium"
            >
              ↩ Back to Today
            </button>
          )}
        </div>

        <button
          onClick={() => setSelectedDate(d => offsetDate(d, 1))}
          disabled={isToday}
          className={cn(
            "p-2 rounded-lg border transition-colors shrink-0",
            isToday
              ? "border-border/15 text-muted-foreground/20 cursor-not-allowed bg-transparent"
              : "border-border/40 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ── Subtitle + deadline/status ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/50">
        <p className="text-sm text-muted-foreground">
          {schedule.games.length > 0
            ? `${schedule.games.length} game${schedule.games.length !== 1 ? "s" : ""} on the slate${isToday ? " — pick one team to survive" : ""}`
            : isToday ? "No games scheduled today" : "No games on this date"}
        </p>

        {isToday ? (
          <div className={cn(
            "rounded-lg px-4 py-3 text-center min-w-[150px] shrink-0",
            deadlinePassed
              ? "bg-destructive/10 border border-destructive/30"
              : "bg-primary/10 border border-primary/30",
          )}>
            {deadlinePassed ? (
              <>
                <div className="flex items-center justify-center gap-1.5 text-destructive font-bebas text-lg tracking-wide">
                  <Lock className="w-4 h-4" /> PICKS LOCKED
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Deadline has passed</div>
              </>
            ) : schedule.deadline ? (
              <>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Locks in</div>
                <div className="font-bebas text-2xl text-primary tracking-wide">{countdown}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{formatGameTime(schedule.deadline)}</div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No deadline</div>
            )}
          </div>
        ) : (
          <div className="rounded-lg px-4 py-3 text-center min-w-[150px] shrink-0 bg-muted/20 border border-border/30">
            <div className="font-bebas text-lg tracking-wide text-muted-foreground">FINAL</div>
            <div className="text-xs text-muted-foreground mt-0.5">Results locked</div>
          </div>
        )}
      </div>

      {/* ── Pick status banner ── */}
      {dayPick && (
        <div className={cn(
          "flex items-center gap-3 px-5 py-3.5 rounded-lg border",
          dayPick.result === "win"
            ? "bg-green-500/10 border-green-500/30"
            : dayPick.result === "loss"
            ? "bg-red-500/10 border-red-500/30"
            : "bg-accent/10 border-accent/30",
        )}>
          {dayPick.teamLogoUrl && (
            <img src={dayPick.teamLogoUrl} alt="" className="w-9 h-9 object-contain shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {isToday ? "Today's Pick" : "Your Pick"}
            </div>
            <div className={cn(
              "font-bebas text-xl tracking-wide",
              dayPick.result === "win" ? "text-green-400" : dayPick.result === "loss" ? "text-red-400" : "text-accent",
            )}>
              {dayPick.teamName}
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md border shrink-0",
            dayPick.result === "win"
              ? "bg-green-500/15 text-green-400 border-green-500/40"
              : dayPick.result === "loss"
              ? "bg-red-500/15 text-red-400 border-red-500/40"
              : "bg-muted/30 text-muted-foreground border-border/50",
          )}>
            {dayPick.result === "win" ? (
              <><Check className="w-3 h-3" /> WIN</>
            ) : dayPick.result === "loss" ? (
              <><X className="w-3 h-3" /> LOSS</>
            ) : (
              "PENDING"
            )}
          </div>
          {isToday && !deadlinePassed && dayPick.result === "pending" && (
            <span className="text-xs text-muted-foreground hidden sm:block">Tap another team to change</span>
          )}
        </div>
      )}

      {/* ── Warnings ── */}
      {!dayPick && isToday && !deadlinePassed && schedule.games.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            No pick yet — tap a team below to lock in.
            {schedule.deadline && ` Deadline: ${formatGameTime(schedule.deadline)}.`}
          </span>
        </div>
      )}
      {!dayPick && !isToday && schedule.games.length > 0 && (
        <div className="px-4 py-2.5 bg-muted/15 border border-border/25 rounded-lg text-sm text-muted-foreground/70">
          No pick was submitted for this date.
        </div>
      )}

      {/* ── Game cards ── */}
      {schedule.games.length === 0 ? (
        <div className="text-muted-foreground p-12 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
          {isToday ? "No MLB games scheduled for today. Check back tomorrow!" : "No MLB games were scheduled on this date."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {schedule.games.map(game => {
            const gameStarted = game.hasStarted ?? false;
            const gameFinal = game.status === "final";
            const awayPicked = currentPickId === game.awayTeam.id;
            const homePicked = currentPickId === game.homeTeam.id;
            const awayWins = gameFinal && game.awayScore != null && game.homeScore != null && game.awayScore > game.homeScore;
            const homeWins = gameFinal && game.homeScore != null && game.awayScore != null && game.homeScore > game.awayScore;

            const canPickAway = isToday && !deadlinePassed && !gameStarted && !gameFinal;
            const canPickHome = isToday && !deadlinePassed && !gameStarted && !gameFinal;

            return (
              <div key={game.id} className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                {/* Status bar */}
                <div className={cn(
                  "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-center border-b border-border/30",
                  gameFinal ? "bg-muted/30 text-muted-foreground"
                  : gameStarted ? "bg-green-500/10 text-green-400"
                  : "bg-transparent text-muted-foreground/60",
                )}>
                  {gameFinal ? "Final" : gameStarted ? "🔴 Live" : formatGameTime(game.startTime)}
                </div>

                <div className="grid grid-cols-[1fr_32px_1fr]">
                  <TeamButton
                    team={game.awayTeam}
                    isPicked={awayPicked}
                    isSelectable={canPickAway}
                    score={gameStarted || gameFinal ? (game.awayScore ?? null) : null}
                    isWinner={awayWins}
                    isWrong={gameFinal && awayPicked && !awayWins}
                    onClick={() => canPickAway && handlePickTeam(
                      game.awayTeam.id,
                      game.awayTeam.name,
                      game.awayTeam.logoUrl ?? "",
                    )}
                  />
                  <div className="flex items-center justify-center text-muted-foreground/30 font-bebas text-sm select-none">
                    @
                  </div>
                  <TeamButton
                    team={game.homeTeam}
                    isPicked={homePicked}
                    isSelectable={canPickHome}
                    score={gameStarted || gameFinal ? (game.homeScore ?? null) : null}
                    isWinner={homeWins}
                    isWrong={gameFinal && homePicked && !homeWins}
                    onClick={() => canPickHome && handlePickTeam(
                      game.homeTeam.id,
                      game.homeTeam.name,
                      game.homeTeam.logoUrl ?? "",
                    )}
                  />
                </div>

                {/* Team name labels */}
                <div className="grid grid-cols-[1fr_32px_1fr] border-t border-border/20 bg-muted/10">
                  <div className="px-3 py-1.5 text-center text-xs text-muted-foreground truncate">{game.awayTeam.name}</div>
                  <div />
                  <div className="px-3 py-1.5 text-center text-xs text-muted-foreground truncate">{game.homeTeam.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
