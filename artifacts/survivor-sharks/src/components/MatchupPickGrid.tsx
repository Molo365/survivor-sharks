import { useState } from "react";
import { useListSportGames, useGetMyPicks, useSubmitPick, getGetMyPicksQueryKey } from "@workspace/api-client-react";
import type { Game, Team } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Lock, Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Sport = "nfl" | "mlb" | "nba" | "nhl" | "fifa";

function formatGameTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function TeamSide({
  team,
  record,
  score,
  isSelected,
  isUsed,
  isLocked,
  isCurrentPick,
  onClick,
  side,
}: {
  team: Team;
  record: string | null;
  score: number | null;
  isSelected: boolean;
  isUsed: boolean;
  isLocked: boolean;
  isCurrentPick: boolean;
  onClick: () => void;
  side: "away" | "home";
}) {
  const disabled = isUsed || isLocked;

  const logoUrl = team.logoUrl
    ?? (team.sport === "fifa"
      ? `https://flagcdn.com/w80/${team.id.toLowerCase()}.png`
      : `https://a.espncdn.com/i/teamlogos/${team.sport}/500/${team.abbreviation.toLowerCase()}.png`);

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      data-testid={`team-pick-${team.id}`}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-center gap-2 p-4 min-h-[130px] transition-all select-none",
        side === "away" ? "rounded-l-xl" : "rounded-r-xl",
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "cursor-pointer hover:bg-primary/5 active:scale-[0.98]",
        isSelected && !disabled
          ? "bg-primary/10 ring-2 ring-inset ring-primary/70"
          : !disabled
            ? "hover:ring-1 hover:ring-inset hover:ring-primary/30"
            : ""
      )}
    >
      {/* Logo */}
      <div className="relative">
        <img
          src={logoUrl}
          alt={team.name}
          className={cn(
            "w-14 h-14 object-contain drop-shadow-md",
            isUsed && "grayscale"
          )}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        {isCurrentPick && (
          <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-center">
        <p className={cn(
          "font-bebas tracking-wide text-base leading-tight",
          isSelected ? "text-primary" : "text-foreground"
        )}>
          {team.name}
        </p>
        {record && (
          <p className="text-[11px] text-muted-foreground font-mono">{record}</p>
        )}
      </div>

      {/* Score (when game in progress or final) */}
      {score != null && (
        <span className={cn(
          "font-bebas text-2xl tracking-wide",
          isSelected ? "text-primary" : "text-foreground/80"
        )}>
          {score}
        </span>
      )}

      {/* Badges */}
      {isUsed && (
        <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-widest bg-destructive/20 text-destructive border border-destructive/30 px-1.5 py-0.5 rounded-full">
          Used
        </span>
      )}
      {isLocked && !isUsed && (
        <span className="absolute top-2 right-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
        </span>
      )}
    </button>
  );
}

type SelectedTeam = { id: string; name: string; logoUrl: string | null };

function MatchupCard({
  game,
  pickedTeamIds,
  currentPickTeamId,
  selectedTeam,
  onSelect,
}: {
  game: Game;
  pickedTeamIds: string[];
  currentPickTeamId?: string;
  selectedTeam: SelectedTeam | null;
  onSelect: (team: SelectedTeam) => void;
}) {
  const isGameLocked = game.hasStarted;
  const isHomeUsed = pickedTeamIds.includes(game.homeTeam.id) && currentPickTeamId !== game.homeTeam.id;
  const isAwayUsed = pickedTeamIds.includes(game.awayTeam.id) && currentPickTeamId !== game.awayTeam.id;
  const statusLabel = game.status === "STATUS_FINAL" || game.status?.includes("FINAL")
    ? "Final"
    : game.hasStarted
      ? "In Progress"
      : null;

  const selectedId = selectedTeam?.id;

  return (
    <div className={cn(
      "shark-card rounded-xl border overflow-hidden transition-all",
      (game.homeTeam.id === selectedId || game.awayTeam.id === selectedId)
        ? "border-primary/60 shadow-[0_0_20px_rgba(30,144,255,0.15)]"
        : "border-border/50"
    )}>
      <div className="flex items-stretch divide-x divide-border/40">
        {/* Away Team */}
        <TeamSide
          team={game.awayTeam}
          record={game.awayRecord ?? null}
          score={game.awayScore ?? null}
          isSelected={selectedId === game.awayTeam.id}
          isUsed={isAwayUsed}
          isLocked={isGameLocked && !isAwayUsed}
          isCurrentPick={currentPickTeamId === game.awayTeam.id}
          onClick={() => onSelect({ id: game.awayTeam.id, name: game.awayTeam.name, logoUrl: game.awayTeam.logoUrl ?? null })}
          side="away"
        />

        {/* Centre divider */}
        <div className="flex flex-col items-center justify-center px-3 py-4 gap-1.5 bg-background/40 min-w-[72px] text-center">
          <span className="font-bebas text-xs text-muted-foreground/60 tracking-widest uppercase">Away</span>
          <span className="font-bebas text-lg text-muted-foreground/80">vs</span>
          <span className="font-bebas text-xs text-muted-foreground/60 tracking-widest uppercase">Home</span>

          {statusLabel ? (
            <span className={cn(
              "mt-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
              statusLabel === "Final"
                ? "bg-muted/40 text-muted-foreground border-border/50"
                : "bg-accent/10 text-accent border-accent/30 animate-pulse"
            )}>
              {statusLabel}
            </span>
          ) : (
            <div className="mt-1 flex flex-col items-center gap-0.5">
              <Clock className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[9px] text-muted-foreground/50 leading-tight">
                {formatGameTime(game.startTime)}
              </span>
            </div>
          )}

          {game.odds?.details && (
            <span className="mt-1 text-[9px] font-mono text-muted-foreground/50 leading-tight">
              {game.odds.details}
              {game.odds.overUnder != null ? ` · o/u ${game.odds.overUnder}` : ""}
            </span>
          )}
        </div>

        {/* Home Team */}
        <TeamSide
          team={game.homeTeam}
          record={game.homeRecord ?? null}
          score={game.homeScore ?? null}
          isSelected={selectedId === game.homeTeam.id}
          isUsed={isHomeUsed}
          isLocked={isGameLocked && !isHomeUsed}
          isCurrentPick={currentPickTeamId === game.homeTeam.id}
          onClick={() => onSelect({ id: game.homeTeam.id, name: game.homeTeam.name, logoUrl: game.homeTeam.logoUrl ?? null })}
          side="home"
        />
      </div>
    </div>
  );
}

export function MatchupPickGrid({
  poolId,
  sport,
  currentWeek,
}: {
  poolId: number;
  sport: Sport;
  currentWeek: number;
}) {
  const { data: games, isLoading: loadingGames } = useListSportGames(sport, currentWeek, {
    query: { enabled: !!sport && !!currentWeek, queryKey: ["schedule", sport, currentWeek] },
  });
  const { data: picks, isLoading: loadingPicks } = useGetMyPicks(poolId, {
    query: { enabled: !!poolId, queryKey: getGetMyPicksQueryKey(poolId) },
  });

  const submitPick = useSubmitPick();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Track not just the ID but the full team object so we can send the
  // exact name/logo the user saw on the card, bypassing the static lookup.
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string; logoUrl: string | null } | null>(null);

  const pickedTeamIds = picks?.map(p => p.teamId) ?? [];
  const currentPick = picks?.find(p => p.week === currentWeek);

  const handleSubmit = () => {
    if (!selectedTeam) return;
    const { id: teamId, name: teamName, logoUrl: teamLogoUrl } = selectedTeam;
    submitPick.mutate(
      { poolId, data: { teamId, week: currentWeek, teamName, teamLogoUrl } } as any,
      {
        onSuccess: () => {
          toast({ title: "Pick locked in!", description: `Week ${currentWeek} pick saved.` });
          queryClient.invalidateQueries({ queryKey: getGetMyPicksQueryKey(poolId) });
          setSelectedTeam(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Pick rejected",
            description: err?.response?.data?.error ?? err?.message ?? "Unable to submit pick.",
          });
        },
      }
    );
  };

  if (loadingGames || loadingPicks) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-[140px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const gameList = games ?? [];

  // Find the game that contains the current pick's team — used to derive lock state and start time
  const currentPickGame = currentPick
    ? gameList.find(g => g.homeTeam.id === currentPick.teamId || g.awayTeam.id === currentPick.teamId)
    : undefined;

  // The pick is locked once the picked team's game has started
  const pickIsLocked = !!(currentPick && currentPickGame?.hasStarted);

  return (
    <div className="space-y-6">
      {/* Current pick banner — adapts for locked / unlocked state */}
      {currentPick ? (
        pickIsLocked ? (
          <div className="bg-destructive/5 border border-destructive/30 p-4 rounded-xl shadow-[0_0_12px_rgba(220,38,38,0.08)]">
            <div className="flex items-start gap-3">
              <div className="bg-destructive/10 p-2 rounded-full shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bebas text-2xl text-destructive tracking-wide leading-none mb-1">
                  Pick Locked — Game In Progress
                </h3>
                <p className="text-base font-medium text-foreground/90">{currentPick.teamName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This game has started. Your pick cannot be changed.
                </p>
              </div>
              <Lock className="w-5 h-5 text-destructive/60 shrink-0 mt-1" />
            </div>
          </div>
        ) : (
          <div className="bg-primary/10 border border-primary/50 p-4 rounded-xl shadow-[0_0_15px_rgba(30,144,255,0.1)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bebas text-2xl text-primary tracking-wide leading-none mb-1">
                  Your Pick — Week {currentWeek}
                </h3>
                <p className="text-lg font-medium text-foreground/90">{currentPick.teamName}</p>
                {currentPickGame && !currentPickGame.hasStarted && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Locks {formatGameTime(currentPickGame.startTime)}
                  </p>
                )}
              </div>
              <div className="bg-primary/20 p-2 rounded-full shrink-0">
                <Check className="w-8 h-8 text-primary" />
              </div>
            </div>
          </div>
        )
      ) : null}

      {/* Week heading */}
      <div className="flex items-center gap-3">
        <h2 className="font-bebas text-2xl tracking-wide text-muted-foreground/70 uppercase">
          Week {currentWeek} Matchups
        </h2>
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          {gameList.length} game{gameList.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Matchup cards — fully disabled once pick is locked */}
      {gameList.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">No games found for this week.</p>
      ) : (
        <div className={cn("space-y-3", pickIsLocked && "pointer-events-none opacity-50 select-none")}>
          {gameList.map(game => (
            <MatchupCard
              key={game.id}
              game={game}
              pickedTeamIds={pickedTeamIds}
              currentPickTeamId={currentPick?.teamId}
              selectedTeam={pickIsLocked ? null : selectedTeam}
              onSelect={(team) => {
                if (!pickIsLocked) setSelectedTeam(prev => prev?.id === team.id ? null : team);
              }}
            />
          ))}
        </div>
      )}

      {/* Submit row — hidden when locked */}
      {!pickIsLocked && (
        <div className="pt-6 border-t border-border/50 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {selectedTeam
              ? `Selected: ${selectedTeam.name}`
              : currentPick
                ? "Click a team above to change your pick"
                : "Click a team in any matchup to make your pick"}
          </p>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTeam || selectedTeam.id === currentPick?.teamId || submitPick.isPending}
            className="font-bebas text-xl px-10 h-14 tracking-widest shrink-0"
            data-testid="button-submit-pick"
          >
            {submitPick.isPending
              ? "SUBMITTING…"
              : currentPick
                ? "UPDATE PICK"
                : "LOCK IN PICK"}
          </Button>
        </div>
      )}
    </div>
  );
}
