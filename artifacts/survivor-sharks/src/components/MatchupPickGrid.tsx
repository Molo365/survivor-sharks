import { useState } from "react";
import { useListSportGames, useGetMyPicks, useSubmitPick, getGetMyPicksQueryKey } from "@workspace/api-client-react";
import type { Game, Team, GameInjury, GamePitcher } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Lock, Clock, ShieldAlert, Wind, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";

type Sport = "nfl" | "mlb" | "nba" | "nhl" | "fifa";

// ── Utilities ──────────────────────────────────────────────────────────────

function formatGameTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return iso; }
}

function hexToRgba(hex: string | null | undefined, alpha: number): string {
  if (!hex) return `rgba(128,128,128,${alpha})`;
  const h = hex.replace("#", "");
  if (h.length < 6) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatMoneyline(ml: number | null | undefined): string {
  if (ml == null) return "";
  return ml > 0 ? `+${ml}` : `${ml}`;
}

function injuryStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s === "ir" || s.includes("injured reserve")) return "OUT";
  if (s.includes("doubtful")) return "DTFL";
  if (s.includes("questionable")) return "QUES";
  if (s.includes("day-to-day") || s.includes("day to day")) return "DTD";
  return status.slice(0, 4).toUpperCase();
}

function injuryStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s === "ir") return "text-destructive";
  if (s.includes("doubtful")) return "text-orange-500";
  if (s.includes("questionable")) return "text-yellow-500";
  return "text-muted-foreground";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FormDots({ form, side }: { form?: string[]; side: "away" | "home" }) {
  if (!form?.length) return null;
  return (
    <div className={cn("flex gap-1 mt-1.5", side === "home" ? "justify-end" : "justify-start")}>
      {form.map((result, i) => (
        <span
          key={i}
          title={result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"}
          className={cn(
            "w-2.5 h-2.5 rounded-full border",
            result === "W"
              ? "bg-green-500/80 border-green-400/50"
              : result === "L"
                ? "bg-red-500/50 border-red-400/40"
                : "bg-muted-foreground/20 border-muted-foreground/20"
          )}
        />
      ))}
    </div>
  );
}

function PitcherCard({ pitcher, side }: { pitcher: GamePitcher; side: "away" | "home" }) {
  const record = pitcher.wins != null && pitcher.losses != null
    ? `${pitcher.wins}-${pitcher.losses}`
    : null;
  return (
    <div className={cn(
      "mt-2 flex items-center gap-1.5 border border-border/30 rounded-lg px-2 py-1.5 bg-background/40",
      side === "home" && "flex-row-reverse"
    )}>
      {pitcher.photoUrl ? (
        <img
          src={pitcher.photoUrl}
          alt={pitcher.name}
          className="w-7 h-7 rounded-full object-cover shrink-0 border border-border/30"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-muted/50 shrink-0 flex items-center justify-center text-[8px] text-muted-foreground font-bold">
          P
        </div>
      )}
      <div className={cn("min-w-0", side === "home" && "text-right")}>
        <p className="text-[10px] font-semibold text-foreground/90 truncate leading-tight">{pitcher.name}</p>
        <p className="text-[9px] text-muted-foreground/70 leading-tight font-mono">
          {[pitcher.era ? `${pitcher.era} ERA` : null, record].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}

function InjuryList({ injuries, side }: { injuries?: GameInjury[]; side: "away" | "home" }) {
  if (!injuries?.length) return null;
  return (
    <div className={cn("mt-2 space-y-0.5", side === "home" && "text-right")}>
      {injuries.slice(0, 3).map((inj, i) => (
        <div key={i} className={cn("flex items-center gap-1 text-[10px]", side === "home" && "justify-end")}>
          <span className={cn("font-bold uppercase tracking-wider text-[9px] shrink-0", injuryStatusColor(inj.status))}>
            {injuryStatusLabel(inj.status)}
          </span>
          <span className="text-muted-foreground/70 truncate">
            {inj.name}
            {inj.position ? ` (${inj.position})` : ""}
            {inj.injuryType ? ` — ${inj.injuryType}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

type GameVariant = "upcoming" | "live" | "final";

function TeamSide({
  team,
  record,
  score,
  moneyline,
  form,
  pitcher,
  injuries,
  primaryColor,
  isSelected,
  isUsed,
  isLocked,
  isCurrentPick,
  onClick,
  side,
  variant,
}: {
  team: Team;
  record: string | null;
  score: number | null;
  moneyline: number | null;
  form?: string[];
  pitcher?: GamePitcher | null;
  injuries?: GameInjury[];
  primaryColor: string | null | undefined;
  isSelected: boolean;
  isUsed: boolean;
  isLocked: boolean;
  isCurrentPick: boolean;
  onClick: () => void;
  side: "away" | "home";
  variant: GameVariant;
}) {
  const unpickable = isUsed || isLocked;
  const isFavorite = moneyline != null && moneyline < 0;

  const logoUrl = team.logoUrl
    ?? (team.sport === "fifa"
      ? `https://flagcdn.com/w80/${team.id.toLowerCase()}.png`
      : `https://a.espncdn.com/i/teamlogos/${team.sport}/500/${team.abbreviation.toLowerCase()}.png`);

  // Gradient strength varies by variant — live gets the full team color pop
  const gradientAlpha = variant === "live" ? 0.18 : variant === "upcoming" && isSelected ? 0.22 : 0.08;
  const gradientStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${hexToRgba(primaryColor, gradientAlpha)} 0%, transparent 65%)`,
  };

  return (
    <button
      type="button"
      onClick={unpickable ? undefined : onClick}
      data-testid={`team-pick-${team.id}`}
      style={gradientStyle}
      className={cn(
        "relative flex-1 flex flex-col p-3 transition-all select-none",
        side === "away" ? "items-start rounded-l-xl" : "items-end rounded-r-xl",
        // Height: live games taller to emphasise scores
        variant === "live" ? "min-h-[150px]" : "min-h-[160px]",
        // Interactivity
        isUsed
          ? "opacity-40 cursor-not-allowed"
          : isLocked
            ? "cursor-not-allowed"
            : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
        // Selected ring (upcoming only — live/final can't be selected)
        isSelected && variant === "upcoming"
          ? "ring-2 ring-inset ring-primary/70"
          : variant === "upcoming" && !unpickable
            ? "hover:ring-1 hover:ring-inset hover:ring-primary/30"
            : ""
      )}
    >
      {/* Logo + name */}
      <div className={cn("flex items-center gap-2 w-full", side === "home" && "flex-row-reverse")}>
        <div className="relative shrink-0">
          <img
            src={logoUrl}
            alt={team.name}
            className={cn(
              "object-contain drop-shadow-md",
              // Larger logos on live games for drama
              variant === "live" ? "w-12 h-12" : "w-10 h-10",
              isUsed && "grayscale opacity-60",
              variant === "final" && !isUsed && "opacity-75"
            )}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {isCurrentPick && (
            <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
              <Check className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
        <div className={cn("flex-1 min-w-0", side === "home" && "text-right")}>
          <p className={cn(
            "font-bebas tracking-wide leading-tight truncate",
            variant === "live" ? "text-lg text-foreground" :
            variant === "final" ? "text-base text-foreground/65" :
            isSelected ? "text-primary text-base" : "text-foreground text-base"
          )}>
            {team.name}
          </p>
          {record && (
            <p className={cn(
              "text-[10px] font-mono leading-tight",
              variant === "final" ? "text-muted-foreground/45" : "text-muted-foreground/70"
            )}>
              {record}
            </p>
          )}
        </div>
      </div>

      {/* Score — large + bright for live, muted for final */}
      {score != null && (
        <p className={cn(
          "font-bebas tracking-wide mt-1",
          variant === "live"
            ? "text-5xl text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
            : variant === "final"
              ? "text-3xl text-foreground/55"
              : "text-3xl text-foreground/80"
        )}>
          {score}
        </p>
      )}

      {/* Moneyline — upcoming only (irrelevant after game starts) */}
      {variant === "upcoming" && moneyline != null && (
        <div className={cn("mt-1.5 flex items-center gap-1", side === "home" && "self-end")}>
          <span className={cn(
            "font-mono text-xs font-bold px-1.5 py-0.5 rounded border",
            isFavorite
              ? "text-green-400 border-green-400/30 bg-green-500/10"
              : "text-muted-foreground/70 border-border/40 bg-muted/10"
          )}>
            {formatMoneyline(moneyline)}
          </span>
        </div>
      )}

      {/* Recent form — show for upcoming and live, hide for final (results are in) */}
      {variant !== "final" && <FormDots form={form} side={side} />}

      {/* Pitcher — upcoming and live only */}
      {variant !== "final" && pitcher && <PitcherCard pitcher={pitcher} side={side} />}

      {/* Injuries — all variants (still relevant context) */}
      <InjuryList injuries={injuries} side={side} />

      {/* Corner badges */}
      {isUsed && (
        <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-widest bg-destructive/20 text-destructive border border-destructive/30 px-1.5 py-0.5 rounded-full">
          Used
        </span>
      )}
      {isLocked && !isUsed && (
        <span className="absolute top-2 right-2 opacity-35">
          <Lock className="w-3 h-3 text-muted-foreground" />
        </span>
      )}
    </button>
  );
}

type SelectedTeam = { id: string; name: string; logoUrl: string | null };

function MatchupCard({
  game,
  sport,
  pickedTeamIds,
  currentPickTeamId,
  selectedTeam,
  onSelect,
}: {
  game: Game;
  sport: Sport;
  pickedTeamIds: string[];
  currentPickTeamId?: string;
  selectedTeam: SelectedTeam | null;
  onSelect: (team: SelectedTeam) => void;
}) {
  const isFinal = !!(game.status?.includes("FINAL") || game.status?.includes("final"));
  const isLive = game.hasStarted && !isFinal;
  const variant: GameVariant = isFinal ? "final" : isLive ? "live" : "upcoming";

  const isGameLocked = game.hasStarted;
  const isHomeUsed = pickedTeamIds.includes(game.homeTeam.id) && currentPickTeamId !== game.homeTeam.id;
  const isAwayUsed = pickedTeamIds.includes(game.awayTeam.id) && currentPickTeamId !== game.awayTeam.id;
  const selectedId = selectedTeam?.id;
  const selectedInGame = game.homeTeam.id === selectedId || game.awayTeam.id === selectedId;

  const overUnder = game.odds?.overUnder;
  const isOutdoor = sport === "nfl" || sport === "mlb";
  const hasWeather = isOutdoor && game.weather && game.weather.displayValue && game.weather.displayValue !== "none";

  // ── Card wrapper: three distinct visual states ────────────────────────────
  const cardClass = cn(
    "rounded-xl overflow-hidden transition-all border-l-4",
    variant === "live" && [
      // Dramatic red glow with left border
      "border-l-red-500 border-t border-r border-b border-red-900/40",
      "bg-red-950/20",
      "shadow-[0_0_28px_rgba(239,68,68,0.22),-4px_0_20px_rgba(239,68,68,0.35)]",
    ],
    variant === "final" && [
      // Subdued — clearly done, darker background
      "border-l-border/40 border-t border-r border-b border-border/25",
      "bg-muted/8 opacity-80",
    ],
    variant === "upcoming" && [
      // Prominent — this is where picks happen
      selectedInGame
        ? "border-l-primary border-t border-r border-b border-primary/50 shadow-[0_0_22px_rgba(30,144,255,0.18),-4px_0_14px_rgba(30,144,255,0.22)]"
        : "border-l-primary/60 border-t border-r border-b border-border/50 shadow-[0_0_12px_rgba(30,144,255,0.08)] hover:shadow-[0_0_18px_rgba(30,144,255,0.14)] hover:border-primary/40",
    ]
  );

  // ── Centre divider ────────────────────────────────────────────────────────
  const dividerClass = cn(
    "flex flex-col items-center justify-start pt-3 pb-3 px-2 gap-1.5 min-w-[72px] text-center",
    variant === "live" ? "bg-red-950/30" :
    variant === "final" ? "bg-muted/12" :
    "bg-background/50"
  );

  return (
    <div className={cardClass}>
      <div className="flex items-stretch divide-x divide-border/20">
        {/* Away Team */}
        <TeamSide
          team={game.awayTeam}
          record={game.awayRecord ?? null}
          score={game.awayScore ?? null}
          moneyline={game.awayMoneyline ?? null}
          form={game.awayForm}
          pitcher={game.awayPitcher}
          injuries={game.awayInjuries}
          primaryColor={game.awayPrimaryColor}
          isSelected={selectedId === game.awayTeam.id}
          isUsed={isAwayUsed}
          isLocked={isGameLocked && !isAwayUsed}
          isCurrentPick={currentPickTeamId === game.awayTeam.id}
          onClick={() => onSelect({ id: game.awayTeam.id, name: game.awayTeam.name, logoUrl: game.awayTeam.logoUrl ?? null })}
          side="away"
          variant={variant}
        />

        {/* Centre divider — content varies by variant */}
        <div className={dividerClass}>
          {variant === "live" ? (
            <>
              {/* LIVE: prominent badge + elapsed time hint */}
              <span className="font-bebas text-[11px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse">
                ● LIVE
              </span>
              <span className="font-bebas text-xl text-foreground/40 mt-1">–</span>
            </>
          ) : variant === "final" ? (
            <>
              {/* FINAL: grey subdued badge */}
              <span className="font-bebas text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30">
                Final
              </span>
              <span className="font-bebas text-xl text-foreground/25 mt-1">–</span>
            </>
          ) : (
            <>
              {/* UPCOMING: orientation labels + full info */}
              <span className="font-bebas text-[10px] text-muted-foreground/50 tracking-widest uppercase">Away</span>
              <span className="font-bebas text-lg text-muted-foreground/70">vs</span>
              <span className="font-bebas text-[10px] text-muted-foreground/50 tracking-widest uppercase">Home</span>

              {/* Start time — prominent for upcoming */}
              <div className="mt-0.5 flex flex-col items-center gap-0.5">
                <Clock className="w-3 h-3 text-primary/50" />
                <span className="text-[9px] text-muted-foreground/60 leading-tight font-medium">
                  {formatGameTime(game.startTime)}
                </span>
              </div>

              {/* O/U */}
              {overUnder != null && (
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] text-muted-foreground/40 uppercase tracking-wider">O/U</span>
                  <span className="text-[11px] font-mono font-bold text-foreground/60">{overUnder}</span>
                </div>
              )}

              {/* Spread */}
              {game.odds?.details && (
                <span className="text-[9px] font-mono text-muted-foreground/40 leading-tight text-center">
                  {game.odds.details}
                </span>
              )}

              {/* Weather */}
              {hasWeather && (
                <div className="mt-1 flex flex-col items-center gap-0.5 border-t border-border/20 pt-1.5 w-full">
                  {game.weather!.temperature != null && (
                    <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground/55">
                      <Thermometer className="w-2.5 h-2.5 shrink-0" />
                      <span>{game.weather!.temperature}°F</span>
                    </div>
                  )}
                  {game.weather!.conditionDescription && (
                    <span className="text-[8px] text-muted-foreground/40 leading-tight text-center">
                      {game.weather!.conditionDescription}
                    </span>
                  )}
                  {game.weather!.windSpeed != null && game.weather!.windSpeed > 0 && (
                    <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground/55">
                      <Wind className="w-2.5 h-2.5 shrink-0" />
                      <span>{game.weather!.windSpeed}mph {game.weather!.windDirection ?? ""}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Home Team */}
        <TeamSide
          team={game.homeTeam}
          record={game.homeRecord ?? null}
          score={game.homeScore ?? null}
          moneyline={game.homeMoneyline ?? null}
          form={game.homeForm}
          pitcher={game.homePitcher}
          injuries={game.homeInjuries}
          primaryColor={game.homePrimaryColor}
          isSelected={selectedId === game.homeTeam.id}
          isUsed={isHomeUsed}
          isLocked={isGameLocked && !isHomeUsed}
          isCurrentPick={currentPickTeamId === game.homeTeam.id}
          onClick={() => onSelect({ id: game.homeTeam.id, name: game.homeTeam.name, logoUrl: game.homeTeam.logoUrl ?? null })}
          side="home"
          variant={variant}
        />
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

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
          <Skeleton key={i} className="h-[180px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const gameList = games ?? [];

  const currentPickGame = currentPick
    ? gameList.find(g => g.homeTeam.id === currentPick.teamId || g.awayTeam.id === currentPick.teamId)
    : undefined;
  const pickIsLocked = !!(currentPick && currentPickGame?.hasStarted);

  return (
    <div className="space-y-6">
      {/* Pick banner */}
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
                <p className="text-xs text-muted-foreground mt-1">This game has started. Your pick cannot be changed.</p>
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

      {/* Cards */}
      {gameList.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">No games found for this week.</p>
      ) : (
        <div className={cn("space-y-3", pickIsLocked && "pointer-events-none select-none")}>
          {gameList.map(game => (
            <MatchupCard
              key={game.id}
              game={game}
              sport={sport}
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

      {/* Submit */}
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
            {submitPick.isPending ? "SUBMITTING…" : currentPick ? "UPDATE PICK" : "LOCK IN PICK"}
          </Button>
        </div>
      )}
    </div>
  );
}
