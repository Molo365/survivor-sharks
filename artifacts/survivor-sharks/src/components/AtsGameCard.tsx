/**
 * AtsGameCard — used inside PickEmView for NBA Weekend ATS (nba_ats) pools.
 * Identical wire format to GameCard but shows spread lines and lets the
 * user pick which team covers, rather than which team wins outright.
 *
 * Extra fields attached by the server on ATS game objects (via type assertion):
 *   spread: number | null           — absolute spread value, e.g. 6.5
 *   favoriteTeamId: string | null   — ESPN team ID of the favourite (the team giving points)
 *   etDate: string | null           — ET calendar date, e.g. "2026-01-03"
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

/** Format a spread value from the favourite's perspective: -6.5 or +6.5 */
function spreadLine(isFavorite: boolean, spread: number): string {
  const val = Number.isInteger(spread) ? spread.toFixed(1) : String(spread);
  return isFavorite ? `-${val}` : `+${val}`;
}

export function AtsGameCard({ game, pickedTeamId, onPick }: AtsGameCardProps) {
  const spread: number | null = (game as any).spread ?? null;
  const favoriteTeamId: string | null = (game as any).favoriteTeamId ?? null;

  const isLocked = game.deadlinePassed;
  const isFinal = game.status === "final";

  const awayIsFavorite = favoriteTeamId === game.awayTeam.id;
  const homeIsFavorite = favoriteTeamId === game.homeTeam.id;

  const awayPicked = pickedTeamId === game.awayTeam.id;
  const homePicked = pickedTeamId === game.homeTeam.id;

  // Result state for display after grading
  const result = game.userPickResult ?? null;
  const isCorrect = result === "correct";
  const isIncorrect = result === "incorrect";

  // Live detail text (e.g. "End of 3rd")
  const liveDetail = game.liveDetail ?? null;

  // Score line (shown post-lock)
  const showScore = isLocked && game.awayScore != null && game.homeScore != null;

  function teamButton(
    teamId: string,
    teamName: string,
    teamAbbr: string,
    logoUrl: string | null,
    isFavoriteTeam: boolean,
    isPicked: boolean,
    score: number | null,
  ) {
    const line = spread != null ? spreadLine(isFavoriteTeam, spread) : null;
    const resultForThisPick = isPicked ? result : null;

    return (
      <button
        type="button"
        disabled={isLocked}
        onClick={() => !isLocked && onPick(teamId)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all duration-150 min-w-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          isLocked
            ? "cursor-default"
            : "cursor-pointer hover:bg-muted/40",
          // Result colouring
          resultForThisPick === "correct"
            ? "border-green-500/60 bg-green-500/10"
            : resultForThisPick === "incorrect"
              ? "border-red-500/40 bg-red-500/8"
              : isPicked
                ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(var(--primary),0.25)]"
                : "border-border/40 bg-muted/10",
        )}
        aria-pressed={isPicked}
        aria-label={`${teamName}${line ? ` ${line}` : ""}`}
      >
        {/* Team logo */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={teamAbbr}
            className="w-10 h-10 object-contain"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center">
            <span className="font-bebas text-lg text-muted-foreground">{teamAbbr.slice(0, 2)}</span>
          </div>
        )}

        {/* Team name + spread line */}
        <div className="text-center min-w-0 w-full">
          <p className="font-bebas text-lg leading-none truncate tracking-wide">{teamAbbr}</p>
          {line && (
            <p className={cn(
              "font-mono text-sm font-semibold leading-none mt-0.5",
              isFavoriteTeam ? "text-orange-400" : "text-blue-400",
            )}>
              {line}
            </p>
          )}
          {line == null && spread == null && (
            <p className="text-xs text-muted-foreground/50 mt-0.5">no line</p>
          )}
        </div>

        {/* Score (post-lock) */}
        {showScore && (
          <span className="font-bebas text-2xl leading-none">
            {teamId === game.awayTeam.id ? (game.awayScore ?? "–") : (game.homeScore ?? "–")}
          </span>
        )}

        {/* Result icon */}
        {resultForThisPick === "correct" && <Check className="w-4 h-4 text-green-400" />}
        {resultForThisPick === "incorrect" && <X className="w-4 h-4 text-red-400" />}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 overflow-hidden transition-all",
        isCorrect
          ? "border-green-500/30"
          : isIncorrect
            ? "border-red-500/20"
            : pickedTeamId
              ? "border-primary/30"
              : "border-border/30",
      )}
    >
      {/* Header: time + status + lock */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 gap-2">
        <span className="text-xs text-muted-foreground/70">
          {liveDetail ?? (
            isLocked && isFinal
              ? "Final"
              : isLocked
                ? "In Progress"
                : new Date(game.startTime).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/New_York",
                  }) + " ET"
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              <Lock className="w-2.5 h-2.5" /> Locked
            </span>
          )}
          {game.status === "in_progress" && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
          )}
          {spread == null && isLocked && (
            <span className="text-[10px] text-yellow-400/70 font-medium">No line</span>
          )}
        </div>
      </div>

      {/* Team buttons */}
      <div className="flex gap-2 px-3 pb-3">
        {teamButton(
          game.awayTeam.id,
          game.awayTeam.name,
          game.awayTeam.abbreviation,
          game.awayTeam.logoUrl ?? null,
          awayIsFavorite,
          awayPicked,
          game.awayScore ?? null,
        )}
        {teamButton(
          game.homeTeam.id,
          game.homeTeam.name,
          game.homeTeam.abbreviation,
          game.homeTeam.logoUrl ?? null,
          homeIsFavorite,
          homePicked,
          game.homeScore ?? null,
        )}
      </div>

      {/* "Away @ Home" label */}
      <div className="px-4 pb-2 text-center">
        <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">
          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
        </p>
      </div>
    </div>
  );
}
