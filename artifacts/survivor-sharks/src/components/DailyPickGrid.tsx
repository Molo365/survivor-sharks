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
import { Check, Lock, AlertTriangle, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function formatGameTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }) + " ET";
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
  onClick,
}: {
  team: TeamLike;
  isPicked: boolean;
  isSelectable: boolean;
  score?: number | null;
  isWinner?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!isSelectable}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 p-5 transition-all text-center w-full",
        isSelectable && !isPicked && "hover:bg-primary/5 cursor-pointer",
        isSelectable && isPicked && "cursor-default",
        !isSelectable && "cursor-default",
        isPicked && "bg-accent/10",
        isWinner && !isPicked && "bg-green-500/5",
        !isSelectable && !isPicked && !isWinner && "opacity-60",
      )}
    >
      {team.logoUrl ? (
        <img src={team.logoUrl} alt={team.name} className="w-12 h-12 object-contain" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center font-bebas text-lg text-muted-foreground">
          {team.abbreviation?.slice(0, 3) ?? "?"}
        </div>
      )}

      <div>
        <div className={cn("font-bebas text-xl tracking-wide", isPicked ? "text-accent" : isWinner ? "text-green-400" : "text-foreground")}>
          {team.abbreviation ?? team.name}
        </div>
        {team.record && (
          <div className="text-xs text-muted-foreground">{team.record}</div>
        )}
      </div>

      {score != null && (
        <div className={cn("font-bebas text-3xl leading-none", isWinner ? "text-green-400" : "text-foreground")}>
          {score}
        </div>
      )}

      {isPicked && (
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

  const { data: schedule, isLoading: scheduleLoading } = useGetDailySchedule(poolId, {
    query: {
      enabled: !!poolId,
      queryKey: getGetDailyScheduleQueryKey(poolId),
      refetchInterval: 60_000,
    },
  });

  const { data: picks } = useGetMyPicks(poolId, {
    query: { enabled: !!poolId, queryKey: getGetMyPicksQueryKey(poolId) },
  });

  const submitPick = useSubmitPick();
  const countdown = useDeadlineCountdown(schedule?.deadline);
  const todayPick = picks?.find(p => (p as any).pickDate === schedule?.date);
  const deadlinePassed = schedule?.deadlinePassed ?? false;
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);

  const currentPickId = submitPick.isPending
    ? pendingTeamId
    : (todayPick?.teamId ?? null);

  function handlePickTeam(teamId: string, teamName: string, teamLogoUrl: string) {
    if (deadlinePassed) return;
    setPendingTeamId(teamId);
    submitPick.mutate(
      { poolId, data: { teamId, teamName, teamLogoUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyPicksQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetDailyScheduleQueryKey(poolId) });
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-5 h-5 text-primary" />
            <span className="font-bebas text-2xl tracking-wide text-primary">{schedule.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {schedule.games.length > 0
              ? `${schedule.games.length} game${schedule.games.length !== 1 ? "s" : ""} on the slate — pick one team to survive`
              : "No games scheduled today"}
          </p>
        </div>

        {/* Deadline indicator */}
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
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatGameTime(schedule.deadline)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No deadline</div>
          )}
        </div>
      </div>

      {/* Today's pick status */}
      {todayPick && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-accent/10 border border-accent/30 rounded-lg">
          {todayPick.teamLogoUrl && (
            <img src={todayPick.teamLogoUrl} alt="" className="w-9 h-9 object-contain shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Today's Pick</div>
            <div className="font-bebas text-xl text-accent tracking-wide">{todayPick.teamName}</div>
          </div>
          <div className={cn(
            "flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border shrink-0",
            todayPick.result === "win"
              ? "bg-green-500/10 text-green-400 border-green-500/30"
              : todayPick.result === "loss"
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-muted/30 text-muted-foreground border-border/50",
          )}>
            {todayPick.result === "win" ? "✓ WIN" : todayPick.result === "loss" ? "✗ LOSS" : "PENDING"}
          </div>
          {!deadlinePassed && todayPick.result === "pending" && (
            <span className="text-xs text-muted-foreground hidden sm:block">Tap another team to change</span>
          )}
        </div>
      )}

      {/* No pick warning */}
      {!todayPick && !deadlinePassed && schedule.games.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            No pick yet — tap a team below to lock in.
            {schedule.deadline && ` Deadline: ${formatGameTime(schedule.deadline)}.`}
          </span>
        </div>
      )}

      {/* Game cards */}
      {schedule.games.length === 0 ? (
        <div className="text-muted-foreground p-12 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
          No MLB games scheduled for today. Check back tomorrow!
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

            const canPickAway = !deadlinePassed && !gameStarted && !gameFinal;
            const canPickHome = !deadlinePassed && !gameStarted && !gameFinal;

            return (
              <div key={game.id} className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                {/* Status bar */}
                <div className={cn(
                  "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-center border-b border-border/30",
                  gameFinal
                    ? "bg-muted/30 text-muted-foreground"
                    : gameStarted
                    ? "bg-green-500/10 text-green-400"
                    : "bg-transparent text-muted-foreground/60",
                )}>
                  {gameFinal
                    ? "Final"
                    : gameStarted
                    ? "🔴 Live"
                    : formatGameTime(game.startTime)}
                </div>

                <div className="grid grid-cols-[1fr_32px_1fr]">
                  <TeamButton
                    team={game.awayTeam}
                    isPicked={awayPicked}
                    isSelectable={canPickAway}
                    score={gameStarted || gameFinal ? (game.awayScore ?? null) : null}
                    isWinner={awayWins}
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
