/**
 * AtsGameCard — used inside PickEmView for NBA Weekend ATS (nba_ats) pools.
 *
 * Layout mirrors the MLB MatchupPickGrid card:
 *   [away logo | away name + spread]  [centre: @/time/score/lock]  [home name + spread | home logo]
 *
 * The spread is shown inline on the same line as the team name (not stacked below).
 * Spread colouring: favourite = orange (-6.5), underdog = blue (+6.5).
 *
 * Extra fields attached by the server on ATS game objects:
 *   spread: number | null          — absolute spread value, e.g. 6.5
 *   favoriteTeamId: string | null  — ESPN team ID of the favourite
 *   etDate: string | null          — ET calendar date, e.g. "2026-01-03"
 */
import React from "react";
import type { PickEmGame } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Lock, Check, X } from "lucide-react";

interface AtsGameCardProps {
  game: PickEmGame;
  pickedTeamId: string | null;
  /** Called with the team ID the user chose. Ignored when game is locked. */
  onPick: (teamId: string) => void;
}

export function AtsGameCard({ game, pickedTeamId, onPick }: AtsGameCardProps) {
  const spread: number | null = (game as any).spread ?? null;
  const favoriteTeamId: string | null = (game as any).favoriteTeamId ?? null;

  const isLocked = game.deadlinePassed;
  const isFinal = game.status === "final";
  const isInProgress = game.status === "in_progress";
  const liveDetail = game.liveDetail ?? null;
  const showScore = isLocked && game.awayScore != null && game.homeScore != null;

  const awayIsFavorite = favoriteTeamId === game.awayTeam.id;
  const homeIsFavorite = favoriteTeamId === game.homeTeam.id;
  const awayPicked = pickedTeamId === game.awayTeam.id;
  const homePicked = pickedTeamId === game.homeTeam.id;
  const result = game.userPickResult ?? null;
  const isCorrect = result === "correct";
  const isIncorrect = result === "incorrect";

  // Winner coloring: only meaningful once final and scores are known
  const scoresKnown = isFinal && game.awayScore != null && game.homeScore != null;
  const awayWon: boolean | undefined = scoresKnown ? game.awayScore! > game.homeScore! : undefined;
  const homeWon: boolean | undefined = scoresKnown ? game.homeScore! > game.awayScore! : undefined;

  function spreadLabel(isFav: boolean): string | null {
    if (spread == null) return null;
    const val = Number.isInteger(spread) ? spread.toFixed(1) : String(spread);
    return isFav ? `-${val}` : `+${val}`;
  }

  // Card-level left-border matches MLB MatchupPickGrid pattern
  const cardClass = cn(
    "rounded-xl overflow-hidden transition-all border-l-4",
    isCorrect
      ? "border-l-green-500 border-t border-r border-b border-green-900/30 bg-green-950/10"
      : isIncorrect
        ? "border-l-red-500 border-t border-r border-b border-red-900/30 bg-red-950/10"
        : pickedTeamId
          ? "border-l-primary border-t border-r border-b border-primary/40 shadow-[0_0_16px_rgba(30,144,255,0.10),-4px_0_12px_rgba(30,144,255,0.16)]"
          : "border-l-primary/50 border-t border-r border-b border-border/40",
  );

  function TeamSide({
    teamId, abbr, name, logoUrl, isFavTeam, isPicked, score, isWinner, side,
  }: {
    teamId: string;
    abbr: string;
    name: string;
    logoUrl: string | null;
    isFavTeam: boolean;
    isPicked: boolean;
    score: number | null | undefined;
    isWinner: boolean | undefined;
    side: "away" | "home";
  }) {
    const line = spreadLabel(isFavTeam);
    const pickResult = isPicked ? result : null;

    return (
      <button
        type="button"
        onClick={() => !isLocked && onPick(teamId)}
        disabled={isLocked}
        aria-pressed={isPicked}
        className={cn(
          "relative flex-1 flex items-center gap-2 py-2.5 px-2.5 sm:py-3 sm:px-3",
          "transition-all select-none min-h-[72px] sm:min-h-[88px]",
          // Away: logo on far left → flex-row. Home: logo on far right → flex-row-reverse
          side === "away" ? "flex-row" : "flex-row-reverse",
          isLocked ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
          // Pick state background
          pickResult === "correct"
            ? "bg-green-500/10"
            : pickResult === "incorrect"
              ? "bg-red-500/10"
              : isPicked
                ? "bg-primary/[0.12]"
                : "",
          // Ring
          pickResult === "correct"
            ? "ring-2 ring-inset ring-green-500/50"
            : pickResult === "incorrect"
              ? "ring-2 ring-inset ring-red-500/50"
              : isPicked
                ? "ring-2 ring-inset ring-primary/60"
                : !isLocked
                  ? "hover:ring-1 hover:ring-inset hover:ring-primary/25"
                  : "",
        )}
      >
        {/* Logo — in a white pill, same as MLB card */}
        <div className="relative shrink-0">
          <div className="rounded-full bg-white/90 p-1 shadow-sm">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={abbr}
                className={cn(
                  "w-10 h-10 sm:w-11 sm:h-11 object-contain",
                  isFinal && isWinner === false && "opacity-55",
                )}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                <span className="font-bebas text-base text-muted-foreground">{abbr.slice(0, 2)}</span>
              </div>
            )}
          </div>
          {/* Pick badge on the logo — Check for correct/pending, X for incorrect */}
          {isPicked && (
            <div className={cn(
              "absolute -bottom-1 -right-1 rounded-full p-0.5 shadow-md",
              pickResult === "correct"
                ? "bg-green-500"
                : pickResult === "incorrect"
                  ? "bg-destructive"
                  : "bg-primary",
            )}>
              {pickResult === "incorrect"
                ? <X className="w-2.5 h-2.5 text-white" />
                : <Check className="w-2.5 h-2.5 text-white" />
              }
            </div>
          )}
        </div>

        {/* Name + spread inline (same row) + score below */}
        <div className={cn("flex-1 min-w-0", side === "home" && "text-right")}>
          {/* Team name and spread on the same line */}
          <p className={cn(
            "font-bebas tracking-wide leading-tight",
            isFinal ? "text-foreground/65" : isPicked ? "text-primary" : "text-foreground",
          )}>
            {/* Mobile: abbreviation only */}
            <span className="sm:hidden text-base">{abbr}</span>
            {/* Desktop: full name */}
            <span className="hidden sm:inline text-xl">{name}</span>
            {/* Spread inline — same row as the name */}
            {line != null ? (
              <span className={cn(
                "font-mono text-sm font-semibold ml-1",
                isFavTeam ? "text-orange-400" : "text-blue-400",
              )}>
                {line}
              </span>
            ) : spread == null && (
              <span className="font-mono text-xs text-muted-foreground/35 ml-1">no line</span>
            )}
          </p>

          {/* Score — shown post-lock, coloured by winner */}
          {showScore && score != null && (
            <p className={cn(
              "font-bebas leading-none mt-0.5 text-xl sm:text-2xl",
              isWinner === true
                ? "text-green-400"
                : isWinner === false
                  ? "text-foreground/40"
                  : "text-foreground/55",
            )}>
              {score}
            </p>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className={cardClass}>
      <div className="flex items-stretch divide-x divide-border/20">

        {/* Away team — logo far left */}
        <TeamSide
          teamId={game.awayTeam.id}
          abbr={game.awayTeam.abbreviation}
          name={game.awayTeam.name}
          logoUrl={game.awayTeam.logoUrl ?? null}
          isFavTeam={awayIsFavorite}
          isPicked={awayPicked}
          score={game.awayScore}
          isWinner={awayWon}
          side="away"
        />

        {/* Centre divider — game time / live / final / lock */}
        <div className={cn(
          "flex flex-col items-center justify-center py-2 px-1 sm:px-2 gap-1",
          "min-w-[44px] sm:min-w-[52px] text-center",
          isInProgress ? "bg-red-950/20" : isFinal ? "bg-muted/10" : "bg-background/50",
        )}>
          {isInProgress ? (
            <>
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none">
                LIVE
              </span>
              {game.awayScore != null && game.homeScore != null && (
                <span className="font-bebas text-sm text-white leading-none">
                  {game.awayScore}–{game.homeScore}
                </span>
              )}
              {liveDetail && (
                <span className="text-[9px] text-red-300/60 leading-none">{liveDetail}</span>
              )}
            </>
          ) : isFinal ? (
            <>
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
                Final
              </span>
              {showScore && (
                <span className="font-bebas text-sm text-foreground/50 leading-none">
                  {game.awayScore}–{game.homeScore}
                </span>
              )}
            </>
          ) : isLocked ? (
            <Lock className="w-3.5 h-3.5 text-muted-foreground/30" />
          ) : (
            <>
              <span className="font-bebas text-sm text-muted-foreground/35 leading-none">@</span>
              <span className="text-[9px] text-muted-foreground/45 leading-none font-medium">
                {new Date(game.startTime).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                }) + " ET"}
              </span>
            </>
          )}
        </div>

        {/* Home team — logo far right */}
        <TeamSide
          teamId={game.homeTeam.id}
          abbr={game.homeTeam.abbreviation}
          name={game.homeTeam.name}
          logoUrl={game.homeTeam.logoUrl ?? null}
          isFavTeam={homeIsFavorite}
          isPicked={homePicked}
          score={game.homeScore}
          isWinner={homeWon}
          side="home"
        />

      </div>
    </div>
  );
}
