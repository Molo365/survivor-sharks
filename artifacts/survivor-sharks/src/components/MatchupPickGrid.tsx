import { useState } from "react";
import {
  useListSportGames,
  useGetMyPicks,
  useSubmitPick,
  getGetMyPicksQueryKey,
  useGetPoolSchedule,
} from "@workspace/api-client-react";
import type { Game, Team, GamePitcher } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Lock, Clock, ShieldAlert, Wind, Thermometer, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { invalidatePoolQueries } from "@/lib/queryUtils";

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

function formatDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short",
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

function PitcherLine({ pitcher, side }: { pitcher: GamePitcher; side: "away" | "home" }) {
  const stats = [
    pitcher.era ? `${pitcher.era} ERA` : null,
    pitcher.wins != null && pitcher.losses != null ? `${pitcher.wins}-${pitcher.losses}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <p className={cn("mt-1.5 text-[11px] leading-tight truncate", side === "home" && "text-right")}>
      <span className="text-muted-foreground/45 font-medium">SP: </span>
      <span className="text-foreground/85 font-semibold">{pitcher.name}</span>
      {stats && <span className="text-muted-foreground/55 font-mono"> {stats}</span>}
    </p>
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
        "relative flex-1 flex flex-col py-2 px-2 sm:p-3 transition-all select-none",
        side === "away" ? "items-start rounded-l-xl" : "items-end rounded-r-xl",
        "min-h-[80px] sm:min-h-[96px]",
        isUsed
          ? "opacity-40 cursor-not-allowed"
          : isLocked
            ? "cursor-not-allowed"
            : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
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
          <div className="rounded-full bg-white/90 p-1 shadow-sm">
            <img
              src={logoUrl}
              alt={team.name}
              className={cn(
                "object-contain",
                "w-10 h-10 sm:w-12 sm:h-12",
                isUsed && "grayscale opacity-60",
                variant === "final" && !isUsed && "opacity-75"
              )}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          {isCurrentPick && (
            <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
              <Check className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
        <div className={cn("flex-1 min-w-0", side === "home" && "text-right")}>
          <p className={cn(
            "font-bebas tracking-wide leading-tight truncate text-xs sm:text-xl",
            variant === "final" ? "text-foreground/65" :
            isSelected ? "text-primary" : "text-foreground"
          )}>
            <span className="sm:hidden">{team.abbreviation}</span>
            <span className="hidden sm:inline">{team.name}</span>
          </p>
          {record && (
            <p className={cn(
              "text-[10px] font-mono leading-tight hidden sm:block",
              variant === "final" ? "text-muted-foreground/45" : "text-muted-foreground/70"
            )}>
              {record}
            </p>
          )}
        </div>
      </div>

      {/* Score — only show for final games; live scores are shown in centre divider */}
      {score != null && variant === "final" && (
        <p className="font-bebas tracking-wide mt-1 text-xl sm:text-3xl text-foreground/55">
          {score}
        </p>
      )}

      {/* Moneyline */}
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

      {variant !== "final" && (
        <div className="hidden sm:block">
          <FormDots form={form} side={side} />
        </div>
      )}
      {pitcher && (
        <div className="hidden sm:block">
          <PitcherLine pitcher={pitcher} side={side} />
        </div>
      )}

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

function BaseDiamond({
  onFirst, onSecond, onThird, size = 28,
}: { onFirst: boolean; onSecond: boolean; onThird: boolean; size?: number }) {
  const c = size / 2;
  const d = size * 0.38;
  const r = size * 0.12;
  // Diamond corners: 2nd=top, 1st=right, home=bottom, 3rd=left
  const top = { x: c, y: c - d };
  const right = { x: c + d, y: c };
  const bottom = { x: c, y: c + d };
  const left = { x: c - d, y: c };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon
        points={`${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.8"
      />
      {/* Home plate (bottom) — always empty */}
      <circle cx={bottom.x} cy={bottom.y} r={r * 0.65} fill="rgba(255,255,255,0.12)" />
      {/* 3rd base (left) */}
      <circle cx={left.x} cy={left.y} r={r} fill={onThird ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"} stroke={onThird ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"} strokeWidth="0.6" />
      {/* 2nd base (top) */}
      <circle cx={top.x} cy={top.y} r={r} fill={onSecond ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"} stroke={onSecond ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"} strokeWidth="0.6" />
      {/* 1st base (right) */}
      <circle cx={right.x} cy={right.y} r={r} fill={onFirst ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"} stroke={onFirst ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"} strokeWidth="0.6" />
    </svg>
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
  deadlineLock = false,
}: {
  game: Game;
  sport: Sport;
  pickedTeamIds: string[];
  currentPickTeamId?: string;
  selectedTeam: SelectedTeam | null;
  onSelect: (team: SelectedTeam) => void;
  deadlineLock?: boolean;
}) {
  const isFinal = !!(game.status?.includes("FINAL") || game.status?.includes("final"));
  const isLive = game.hasStarted && !isFinal;
  const variant: GameVariant = isFinal ? "final" : isLive ? "live" : "upcoming";

  // For MLB: lock state is deadline-based. For others: game-start-based.
  const isGameLocked = deadlineLock ? deadlineLock : game.hasStarted;
  const isHomeUsed = pickedTeamIds.includes(game.homeTeam.id) && currentPickTeamId !== game.homeTeam.id;
  const isAwayUsed = pickedTeamIds.includes(game.awayTeam.id) && currentPickTeamId !== game.awayTeam.id;
  const selectedId = selectedTeam?.id;
  const selectedInGame = game.homeTeam.id === selectedId || game.awayTeam.id === selectedId;

  const overUnder = game.odds?.overUnder;
  const isOutdoor = sport === "nfl" || sport === "mlb";
  const hasWeather = isOutdoor && game.weather && game.weather.displayValue && game.weather.displayValue !== "none";

  const cardClass = cn(
    "rounded-xl overflow-hidden transition-all border-l-4",
    variant === "live" && [
      "border-l-red-500 border-t border-r border-b border-red-900/40",
      "bg-red-950/20",
      "shadow-[0_0_28px_rgba(239,68,68,0.22),-4px_0_20px_rgba(239,68,68,0.35)]",
    ],
    variant === "final" && [
      "border-l-border/40 border-t border-r border-b border-border/25",
      "bg-muted/8 opacity-80",
    ],
    variant === "upcoming" && [
      selectedInGame
        ? "border-l-primary border-t border-r border-b border-primary/50 shadow-[0_0_22px_rgba(30,144,255,0.18),-4px_0_14px_rgba(30,144,255,0.22)]"
        : "border-l-primary/60 border-t border-r border-b border-border/50 shadow-[0_0_12px_rgba(30,144,255,0.08)] hover:shadow-[0_0_18px_rgba(30,144,255,0.14)] hover:border-primary/40",
    ]
  );

  const dividerClass = cn(
    "flex flex-col items-center justify-center py-2 px-2 gap-1 min-w-[48px] sm:py-3 sm:px-3 sm:gap-1 sm:min-w-[140px] text-center",
    variant === "live" ? "bg-red-950/30" :
    variant === "final" ? "bg-muted/12" :
    "bg-background/50"
  );

  const awayLogoUrl = game.awayTeam.logoUrl
    ?? (game.awayTeam.sport === "fifa"
      ? `https://flagcdn.com/w80/${game.awayTeam.id.toLowerCase()}.png`
      : `https://a.espncdn.com/i/teamlogos/${game.awayTeam.sport}/500/${game.awayTeam.abbreviation.toLowerCase()}.png`);
  const homeLogoUrl = game.homeTeam.logoUrl
    ?? (game.homeTeam.sport === "fifa"
      ? `https://flagcdn.com/w80/${game.homeTeam.id.toLowerCase()}.png`
      : `https://a.espncdn.com/i/teamlogos/${game.homeTeam.sport}/500/${game.homeTeam.abbreviation.toLowerCase()}.png`);

  const mobileBorderClass = cn(
    "sm:hidden rounded-xl overflow-hidden border-l-4 transition-all",
    variant === "live"
      ? "border-l-red-500 border-t border-r border-b border-red-900/40 bg-red-950/20 shadow-[0_0_28px_rgba(239,68,68,0.22),-4px_0_20px_rgba(239,68,68,0.35)]"
      : variant === "final"
        ? "border-l-border/40 border-t border-r border-b border-border/25 bg-muted/8 opacity-80"
        : selectedInGame
          ? "border-l-primary border-t border-r border-b border-primary/50 shadow-[0_0_22px_rgba(30,144,255,0.18),-4px_0_14px_rgba(30,144,255,0.22)]"
          : "border-l-primary/60 border-t border-r border-b border-border/50"
  );

  return (
    <>
      {/* ── Mobile compact card (hidden on sm+) ─────────────────────────── */}
      <div className={mobileBorderClass}>
        <div className="flex items-center">
          {/* Away */}
          <button
            type="button"
            onClick={(isAwayUsed || (isGameLocked && !isAwayUsed)) ? undefined : () => onSelect({ id: game.awayTeam.id, name: game.awayTeam.name, logoUrl: game.awayTeam.logoUrl ?? null })}
            className={cn(
              "flex-1 flex flex-col items-center py-2.5 px-2 gap-0.5 transition-all",
              isAwayUsed ? "opacity-35 cursor-not-allowed" :
              (isGameLocked && !isAwayUsed) ? "cursor-not-allowed" :
              "cursor-pointer active:scale-95",
              selectedId === game.awayTeam.id && variant === "upcoming" ? "ring-2 ring-inset ring-primary/70 rounded-lg" : ""
            )}
          >
            <div className="relative">
              <div className="rounded-full bg-white/90 p-1 shadow-sm">
                <img
                  src={awayLogoUrl}
                  alt={game.awayTeam.abbreviation}
                  className={cn("w-[46px] h-[46px] object-contain", isAwayUsed && "grayscale", variant === "final" && !isAwayUsed && "opacity-60")}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              {currentPickTeamId === game.awayTeam.id && (
                <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5 shadow-md">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <span className={cn(
              "font-bebas text-sm tracking-wide leading-none mt-0.5",
              variant === "final" ? "text-foreground/55" : selectedId === game.awayTeam.id ? "text-primary" : "text-foreground/85"
            )}>{game.awayTeam.abbreviation}</span>
            {variant === "upcoming" && game.awayMoneyline != null && (
              <span className={cn("font-mono text-[9px] font-bold leading-none", game.awayMoneyline < 0 ? "text-green-400" : "text-muted-foreground/55")}>
                {formatMoneyline(game.awayMoneyline)}
              </span>
            )}
          </button>

          {/* Center */}
          <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
            {variant === "live" ? (
              <>
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none">LIVE</span>
                {game.awayScore != null && game.homeScore != null && (
                  <span className="font-bebas text-base text-white leading-none">{game.awayScore}–{game.homeScore}</span>
                )}
              </>
            ) : variant === "final" ? (
              <>
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">Final</span>
                {game.awayScore != null && game.homeScore != null && (
                  <span className="font-bebas text-sm text-foreground/55 leading-none">{game.awayScore}–{game.homeScore}</span>
                )}
              </>
            ) : (
              <span className="font-bebas text-sm text-muted-foreground/30 leading-none">vs</span>
            )}
          </div>

          {/* Home */}
          <button
            type="button"
            onClick={(isHomeUsed || (isGameLocked && !isHomeUsed)) ? undefined : () => onSelect({ id: game.homeTeam.id, name: game.homeTeam.name, logoUrl: game.homeTeam.logoUrl ?? null })}
            className={cn(
              "flex-1 flex flex-col items-center py-2.5 px-2 gap-0.5 transition-all",
              isHomeUsed ? "opacity-35 cursor-not-allowed" :
              (isGameLocked && !isHomeUsed) ? "cursor-not-allowed" :
              "cursor-pointer active:scale-95",
              selectedId === game.homeTeam.id && variant === "upcoming" ? "ring-2 ring-inset ring-primary/70 rounded-lg" : ""
            )}
          >
            <div className="relative">
              <div className="rounded-full bg-white/90 p-1 shadow-sm">
                <img
                  src={homeLogoUrl}
                  alt={game.homeTeam.abbreviation}
                  className={cn("w-[46px] h-[46px] object-contain", isHomeUsed && "grayscale", variant === "final" && !isHomeUsed && "opacity-60")}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              {currentPickTeamId === game.homeTeam.id && (
                <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5 shadow-md">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <span className={cn(
              "font-bebas text-sm tracking-wide leading-none mt-0.5",
              variant === "final" ? "text-foreground/55" : selectedId === game.homeTeam.id ? "text-primary" : "text-foreground/85"
            )}>{game.homeTeam.abbreviation}</span>
            {variant === "upcoming" && game.homeMoneyline != null && (
              <span className={cn("font-mono text-[9px] font-bold leading-none", game.homeMoneyline < 0 ? "text-green-400" : "text-muted-foreground/55")}>
                {formatMoneyline(game.homeMoneyline)}
              </span>
            )}
          </button>
        </div>

        {/* Game time + pitcher matchup */}
        {variant === "upcoming" && (
          <div className="flex flex-col items-center pb-1.5 gap-0.5">
            <p className="text-[9px] text-muted-foreground/40 leading-none">
              {formatGameTime(game.startTime)}
              {game.odds?.overUnder != null && ` · O/U ${game.odds.overUnder}`}
            </p>
            {(game.awayPitcher || game.homePitcher) && (
              <p className="text-[8px] text-muted-foreground/30 leading-none">
                {game.awayPitcher?.name ?? "TBD"} vs {game.homePitcher?.name ?? "TBD"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Desktop full card (hidden on mobile) ──────────────────────────── */}
      <div className={cn("hidden sm:block", cardClass)}>
        <div className="flex items-stretch divide-x divide-border/20">
          {/* Away Team */}
          <TeamSide
            team={game.awayTeam}
            record={game.awayRecord ?? null}
            score={game.awayScore ?? null}
            moneyline={game.awayMoneyline ?? null}
            form={game.awayForm}
            pitcher={game.awayPitcher}
            primaryColor={game.awayPrimaryColor}
            isSelected={selectedId === game.awayTeam.id}
            isUsed={isAwayUsed}
            isLocked={isGameLocked && !isAwayUsed}
            isCurrentPick={currentPickTeamId === game.awayTeam.id}
            onClick={() => onSelect({ id: game.awayTeam.id, name: game.awayTeam.name, logoUrl: game.awayTeam.logoUrl ?? null })}
            side="away"
            variant={variant}
          />

          {/* Centre divider */}
          <div className={dividerClass}>
            {variant === "live" ? (
              <>
                <span className="font-bebas text-[11px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse">
                  ● LIVE
                </span>
                {game.awayScore != null && game.homeScore != null && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="font-bebas text-2xl text-white leading-none">{game.awayScore}</span>
                    <span className="font-bebas text-base text-foreground/40 leading-none">–</span>
                    <span className="font-bebas text-2xl text-white leading-none">{game.homeScore}</span>
                  </div>
                )}
              </>
            ) : variant === "final" ? (
              <>
                <span className="font-bebas text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30">
                  Final
                </span>
                <span className="font-bebas text-xl text-foreground/25 mt-1">–</span>
              </>
            ) : (
              <>
                <span className="font-bebas text-sm text-muted-foreground/40 leading-none">vs</span>

                {/* Row 1: kickoff time */}
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 text-primary/50 shrink-0" />
                  <span className="text-[10px] text-muted-foreground/70 leading-tight font-medium">
                    {formatGameTime(game.startTime)}
                  </span>
                </div>

                {/* Row 2: O/U + spread inline */}
                {(overUnder != null || game.odds?.details) && (
                  <div className="flex items-center gap-1 flex-wrap justify-center">
                    {overUnder != null && (
                      <span className="text-[10px] font-mono font-semibold text-foreground/55">
                        O/U {overUnder}
                      </span>
                    )}
                    {overUnder != null && game.odds?.details && (
                      <span className="text-[10px] text-muted-foreground/30 leading-none">·</span>
                    )}
                    {game.odds?.details && (
                      <span className="text-[10px] font-mono font-semibold text-foreground/55">
                        {game.odds.details}
                      </span>
                    )}
                  </div>
                )}

                {hasWeather && (
                  <div className="mt-1 flex flex-col items-center gap-0.5 border-t border-border/20 pt-1 w-full">
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
    </>
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
  // MLB: weekly schedule from pool-scoped endpoint
  const { data: schedule, isLoading: loadingSchedule } = useGetPoolSchedule(poolId, {
    query: { enabled: sport === "mlb", queryKey: ["pool-schedule", poolId] },
  });

  // Non-MLB: flat game list from ESPN schedule
  const { data: games, isLoading: loadingGames } = useListSportGames(sport, currentWeek, {
    query: { enabled: !!sport && !!currentWeek && sport !== "mlb", queryKey: ["schedule", sport, currentWeek] },
  });

  const { data: picks, isLoading: loadingPicks } = useGetMyPicks(poolId, {
    query: { enabled: !!poolId, queryKey: getGetMyPicksQueryKey(poolId) },
  });

  const submitPick = useSubmitPick();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);

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
          void invalidatePoolQueries(queryClient, poolId);
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

  // ── Loading states ─────────────────────────────────────────────────────────

  if ((sport === "mlb" ? loadingSchedule : loadingGames) || loadingPicks) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-[180px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ── MLB: weekly grouped view ───────────────────────────────────────────────

  if (sport === "mlb") {
    const deadlinePassed = schedule?.deadlinePassed ?? false;
    const mlbPickIsLocked = deadlinePassed;
    const weekLabel = schedule?.weekLabel ?? `Week ${currentWeek}`;

    const allMlbGames = schedule?.days.flatMap(d => d.games) ?? [];
    const totalGames = allMlbGames.length;

    return (
      <div className="space-y-6">
        {/* MLB pick / deadline banner */}
        {currentPick ? (
          mlbPickIsLocked ? (
            <div className="bg-destructive/5 border border-destructive/30 p-4 rounded-xl shadow-[0_0_12px_rgba(220,38,38,0.08)]">
              <div className="flex items-start gap-3">
                <div className="bg-destructive/10 p-2 rounded-full shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bebas text-2xl text-destructive tracking-wide leading-none mb-1">
                    Pick Locked — Deadline Passed
                  </h3>
                  <p className="text-base font-medium text-foreground/90">{currentPick.teamName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Results will be processed at the end of the week.
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
                    Your Pick — {weekLabel}
                  </h3>
                  <p className="text-lg font-medium text-foreground/90">{currentPick.teamName}</p>
                  {schedule?.deadline && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Locks {formatDeadline(schedule.deadline)}
                    </p>
                  )}
                </div>
                <div className="bg-primary/20 p-2 rounded-full shrink-0">
                  <Check className="w-8 h-8 text-primary" />
                </div>
              </div>
            </div>
          )
        ) : mlbPickIsLocked ? (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="bg-amber-500/10 p-2 rounded-full shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bebas text-2xl text-amber-400 tracking-wide leading-none mb-1">
                  No Pick Submitted — Deadline Passed
                </h3>
                <p className="text-xs text-muted-foreground">
                  The Monday 10 PM ET deadline has passed. Your entry is at risk.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bebas text-xl text-amber-400 tracking-wide leading-none">
                  {weekLabel} · No pick yet
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick any team that wins ≥1 game this week.
                  {schedule?.deadline && ` Locks ${formatDeadline(schedule.deadline)}.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Week heading */}
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-muted-foreground/60" />
          <h2 className="font-bebas text-2xl tracking-wide text-muted-foreground/70 uppercase">
            {weekLabel}
          </h2>
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            {totalGames} game{totalGames !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Day-grouped game cards */}
        {!schedule || schedule.days.every(d => d.games.length === 0) ? (
          <p className="text-muted-foreground text-center py-10">No games found for this week.</p>
        ) : (
          <div className={cn("space-y-6", mlbPickIsLocked && "pointer-events-none select-none")}>
            {schedule.days.map(day => {
              if (day.games.length === 0) return null;
              return (
                <div key={day.date} className="space-y-3">
                  {/* Day header */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground/80 uppercase tracking-wide">
                      {day.label}
                    </span>
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-xs text-muted-foreground/50">
                      {day.games.length} game{day.games.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {day.games.map(game => (
                    <MatchupCard
                      key={game.id}
                      game={game}
                      sport={sport}
                      pickedTeamIds={pickedTeamIds}
                      currentPickTeamId={currentPick?.teamId}
                      selectedTeam={mlbPickIsLocked ? null : selectedTeam}
                      onSelect={(team) => {
                        if (!mlbPickIsLocked) {
                          setSelectedTeam(prev => prev?.id === team.id ? null : team);
                        }
                      }}
                      deadlineLock={mlbPickIsLocked}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Submit */}
        {!mlbPickIsLocked && (
          <div className="pt-6 border-t border-border/50 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {selectedTeam
                ? `Selected: ${selectedTeam.name}`
                : currentPick
                  ? "Click a team above to change your pick"
                  : "Pick any team — they just need to win ≥1 game this week"}
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

  // ── Non-MLB: flat game list ────────────────────────────────────────────────

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
        sport === "nfl" && new Date() < new Date("2026-09-04T00:00:00Z") ? (
          <div className="bg-muted/30 border border-border/40 rounded-xl p-8 text-center space-y-2">
            <p className="font-bebas text-2xl tracking-wider text-foreground/70">NFL Season Starts September 2026</p>
            <p className="text-sm text-muted-foreground">The 2026 regular season schedule isn't out yet — check back in September when Week 1 kicks off.</p>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-10">No games found for this week.</p>
        )
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
