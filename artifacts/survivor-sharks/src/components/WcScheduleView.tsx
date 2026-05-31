import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWcSchedule,
  getGetWcScheduleQueryKey,
  useSubmitPickEmPicks,
  type WcScheduleGame,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, X, Clock, Trophy, Globe, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const WC_PICK_OPTIONS = ["home_win", "draw", "away_win"] as const;
type WcPickOption = (typeof WC_PICK_OPTIONS)[number];
const WC_PICK_LABELS: Record<WcPickOption, string> = {
  away_win: "Away Win",
  draw: "Draw",
  home_win: "Home Win",
};

function formatKickoffTime(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

function hoursUntil(isoStr: string): number {
  return (new Date(isoStr).getTime() - Date.now()) / (60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Per-game card
// ---------------------------------------------------------------------------
function WcGameCard({
  game,
  dateStr,
  pickedOption,
  onPick,
}: {
  game: WcScheduleGame;
  dateStr: string;
  pickedOption: WcPickOption | null;
  onPick: (opt: WcPickOption) => void;
}) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isPast = isFinal || isLive || game.deadlinePassed;
  const isPickable = game.isPickable;

  const result = pickedOption ? game.userPickResult : null;
  const isCorrect = result === "correct";
  const isWrong = result === "incorrect";
  const isPending = result === "pending";

  const hrs = hoursUntil(game.startTime);
  const opensLabel =
    hrs <= 0
      ? null
      : hrs < 24
        ? `Opens in ${Math.floor(hrs)}h ${Math.floor((hrs % 1) * 60)}m`
        : `Opens ${Math.floor(hrs / 24)}d ${Math.floor(hrs % 24)}h before kickoff`;

  return (
    <div
      className={cn(
        "shark-card rounded-xl border overflow-hidden",
        isLive
          ? "border-red-500/60 shadow-[0_0_16px_rgba(239,68,68,0.22)]"
          : isFinal
            ? "border-border/30 opacity-90"
            : isPickable
              ? "border-primary/30"
              : "border-border/25 opacity-80",
      )}
    >
      {/* Header bar: group + status + time */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-1.5">
          {game.group && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
              {game.group}
            </span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500 text-white leading-none">
              <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
              Live{game.liveDetail ? ` · ${game.liveDetail}` : ""}
            </span>
          )}
          {isFinal && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Final
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isPast && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
              <Clock className="w-2.5 h-2.5" />
              {formatKickoffTime(game.startTime)}
            </span>
          )}
          {pickedOption && isCorrect && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-green-400">
              <Check className="w-3 h-3" /> Correct
            </span>
          )}
          {pickedOption && isWrong && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400">
              <X className="w-3 h-3" /> Wrong
            </span>
          )}
          {pickedOption && isPending && (
            <span className="text-[10px] font-bold text-muted-foreground/60">Pending</span>
          )}
        </div>
      </div>

      {/* Teams row */}
      <div className="flex items-center justify-between px-4 py-2.5 gap-3">
        {/* Away team */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {game.awayTeam.logoUrl && (
            <div className="shrink-0 rounded-full bg-white/90 p-1 shadow-sm">
              <img
                src={game.awayTeam.logoUrl}
                alt={game.awayTeam.name}
                className="w-7 h-7 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bebas tracking-wide text-sm leading-tight truncate">
              {game.awayTeam.name}
            </div>
            {(isFinal || isLive) && game.awayScore != null && (
              <div className="font-bebas text-xl leading-none text-foreground">
                {game.awayScore}
              </div>
            )}
          </div>
        </div>

        {/* Center separator */}
        <div className="shrink-0 text-muted-foreground/40 font-bebas text-sm">vs</div>

        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
          <div className="min-w-0">
            <div className="font-bebas tracking-wide text-sm leading-tight truncate">
              {game.homeTeam.name}
            </div>
            {(isFinal || isLive) && game.homeScore != null && (
              <div className="font-bebas text-xl leading-none text-foreground">
                {game.homeScore}
              </div>
            )}
          </div>
          {game.homeTeam.logoUrl && (
            <div className="shrink-0 rounded-full bg-white/90 p-1 shadow-sm">
              <img
                src={game.homeTeam.logoUrl}
                alt={game.homeTeam.name}
                className="w-7 h-7 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Pick section */}
      {isPickable ? (
        <div className="grid grid-cols-3 gap-1 px-3 pb-3">
          {(["away_win", "draw", "home_win"] as WcPickOption[]).map((opt) => {
            const isPicked = pickedOption === opt;
            const label =
              opt === "away_win"
                ? `${game.awayTeam.abbreviation} Win`
                : opt === "home_win"
                  ? `${game.homeTeam.abbreviation} Win`
                  : "Draw";
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onPick(opt)}
                className={cn(
                  "rounded-lg border-2 px-2 py-1.5 text-center font-bebas text-sm tracking-wide transition-all select-none cursor-pointer hover:brightness-110 active:scale-[0.98]",
                  isPicked
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40 text-foreground"
                    : "border-border/40 bg-card/60 text-muted-foreground hover:border-border",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : isPast ? (
        pickedOption ? (
          <div className="px-3 pb-2.5">
            <div
              className={cn(
                "text-xs font-medium rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5",
                isCorrect
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : isWrong
                    ? "bg-red-500/10 text-red-400 border border-red-500/30"
                    : "bg-muted/20 text-muted-foreground/70 border border-border/30",
              )}
            >
              {isCorrect && <Check className="w-3 h-3" />}
              {isWrong && <X className="w-3 h-3" />}
              Your pick: {WC_PICK_LABELS[pickedOption]}
            </div>
          </div>
        ) : (
          <div className="px-3 pb-2.5">
            <span className="text-[11px] text-muted-foreground/40 italic">No pick made</span>
          </div>
        )
      ) : (
        /* Future / not yet within 24h window */
        <div className="px-3 pb-2.5">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 border border-border/30 rounded-full px-2.5 py-0.5">
            {opensLabel ?? "Upcoming"}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WcScheduleView
// ---------------------------------------------------------------------------
interface WcScheduleViewProps {
  poolId: number;
  commissionerId: number;
}

export function WcScheduleView({ poolId, commissionerId }: WcScheduleViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schedule, isLoading } = useGetWcSchedule(poolId, {
    query: {
      queryKey: getGetWcScheduleQueryKey(poolId),
      refetchInterval: 60_000,
    },
  });

  // Local picks: gameId → option string
  const [localPicks, setLocalPicks] = useState<Map<string, string>>(new Map());
  // Track which date groups are collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Load server picks into local state on mount
  useEffect(() => {
    if (!schedule?.dateGroups) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const group of schedule.dateGroups) {
        for (const game of group.games) {
          if (game.userPickOption && !next.has(game.id)) {
            next.set(game.id, game.userPickOption);
          }
        }
      }
      return next;
    });
  }, [schedule]);

  const submitPicks = useSubmitPickEmPicks();

  function handlePick(gameId: string, opt: WcPickOption) {
    setLocalPicks((prev) => {
      const next = new Map(prev);
      next.set(gameId, opt);
      return next;
    });
  }

  function handleSubmit() {
    if (!schedule?.dateGroups) return;

    const picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string; gameDate: string }> = [];

    for (const group of schedule.dateGroups) {
      for (const game of group.games) {
        if (!game.isPickable) continue;
        const opt = localPicks.get(game.id);
        if (!opt) continue;
        picks.push({
          gameId: game.id,
          pickedTeamId: opt,
          pickedTeamName: WC_PICK_LABELS[opt as WcPickOption] ?? opt,
          gameDate: group.date,
        });
      }
    }

    if (picks.length === 0) {
      toast({ title: "No open picks to submit", description: "Pick some games first.", variant: "default" });
      return;
    }

    submitPicks.mutate(
      { poolId, data: { picks } },
      {
        onSuccess: (result) => {
          toast({
            title: `${result.saved} pick${result.saved !== 1 ? "s" : ""} saved`,
            description: "Your picks have been recorded.",
          });
          void queryClient.invalidateQueries({ queryKey: getGetWcScheduleQueryKey(poolId) });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Something went wrong";
          toast({ title: "Failed to save picks", description: msg, variant: "destructive" });
        },
      },
    );
  }

  // Count how many pickable games have local picks vs server picks (unsaved)
  const pickableGames = schedule?.dateGroups.flatMap((g) => g.games.filter((gm) => gm.isPickable)) ?? [];
  const pendingCount = pickableGames.filter((gm) => {
    const local = localPicks.get(gm.id);
    return local && local !== gm.userPickOption;
  }).length;
  const savedCount = pickableGames.filter((gm) => gm.userPickOption).length;

  // Phase label
  const phaseLabel =
    schedule?.phase === "group_stage"
      ? "Group Stage"
      : schedule?.phase === "knockout_stage"
        ? "Knockout Stage"
        : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
      </div>
    );
  }

  if (!schedule || schedule.dateGroups.length === 0) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide">Group Stage schedule not yet available</p>
        <p className="text-sm mt-2">Check back closer to June 11, 2026.</p>
      </div>
    );
  }

  // Find the index of today's date group (or the next upcoming one)
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-primary/70" />
            <span className="font-bebas text-xl tracking-wide text-foreground">
              {phaseLabel ?? "World Cup 2026"}
            </span>
            {phaseLabel && (
              <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70">
            Picks open 24 hours before each kickoff · Pick Away Win, Draw, or Home Win
          </p>
        </div>
        {pickableGames.length > 0 && (
          <div className="text-right shrink-0">
            <div className="font-bebas text-lg leading-tight text-foreground">
              {savedCount}/{pickableGames.length}
            </div>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Picked</div>
          </div>
        )}
      </div>

      {/* Date groups */}
      {schedule.dateGroups.map((group) => {
        const isToday = group.date === todayStr;
        const isPast = group.date < todayStr;
        const isCollapsed = collapsed.has(group.date);

        return (
          <div key={group.date} id={`date-${group.date}`}>
            {/* Date header */}
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.date)) next.delete(group.date);
                  else next.add(group.date);
                  return next;
                })
              }
              className="w-full flex items-center gap-2 mb-3 group cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={cn(
                    "font-bebas text-xl tracking-wider",
                    isToday ? "text-primary" : isPast ? "text-muted-foreground/50" : "text-foreground",
                  )}
                >
                  {group.label.toUpperCase()}
                </span>
                {isToday && (
                  <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                    TODAY
                  </span>
                )}
                <span className="text-xs text-muted-foreground/50">
                  {group.games.length} match{group.games.length !== 1 ? "es" : ""}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-muted-foreground/40 transition-transform shrink-0",
                  isCollapsed ? "-rotate-90" : "rotate-0",
                )}
              />
            </button>

            {!isCollapsed && (
              <div className="space-y-3">
                {group.games.map((game) => (
                  <WcGameCard
                    key={game.id}
                    game={game}
                    dateStr={group.date}
                    pickedOption={(localPicks.get(game.id) ?? game.userPickOption ?? null) as WcPickOption | null}
                    onPick={(opt) => handlePick(game.id, opt)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Sticky submit footer */}
      {pickableGames.length > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className="shark-card rounded-xl border border-primary/30 bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-4 shadow-xl">
            <div>
              <p className="font-bebas text-lg tracking-wide text-foreground leading-tight">
                {pendingCount > 0
                  ? `${pendingCount} unsaved pick${pendingCount !== 1 ? "s" : ""}`
                  : savedCount > 0
                    ? "All picks saved"
                    : "No picks yet"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {savedCount} of {pickableGames.length} open games picked
              </p>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={pendingCount === 0 || submitPicks.isPending}
              className="font-bebas text-xl tracking-widest px-6 h-10"
            >
              {submitPicks.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save Picks"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Post group stage placeholder */}
      {phaseLabel === null && (
        <div className="text-center py-8 border border-border/30 rounded-xl text-muted-foreground/60 bg-muted/10">
          <Trophy className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="font-bebas text-lg tracking-wide">Group Stage: June 11 – 30, 2026</p>
          <p className="text-sm mt-1">Picks open 24 hours before each match.</p>
        </div>
      )}
    </div>
  );
}
