import type { ReactNode } from "react";
import { Shuffle } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type TiebreakerMatchupTeam = {
  name: string;
  abbreviation?: string;
  logoUrl?: string | null;
};

export type TiebreakerMatchupGame = {
  awayTeam: TiebreakerMatchupTeam;
  homeTeam: TiebreakerMatchupTeam;
  startTime?: string | null;
};

export function formatTiebreakerKickoffEt(startTime: string): string {
  return (
    new Date(startTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      hour12: true,
    }) + " ET"
  );
}

export function TiebreakerGuessDialogTitle() {
  return (
    <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
      <Shuffle className="w-5 h-5 text-yellow-400" />
      Tiebreaker Guess
    </DialogTitle>
  );
}

export function TiebreakerMatchupHeadline({ game }: { game: TiebreakerMatchupGame | null }) {
  if (!game) return null;
  const gameTime = game.startTime ? formatTiebreakerKickoffEt(game.startTime) : null;
  return (
    <span className="block text-sm font-semibold text-foreground">
      {game.awayTeam.name} @ {game.homeTeam.name}
      {gameTime && <span className="ml-2 text-muted-foreground font-normal">· {gameTime}</span>}
    </span>
  );
}

function TeamLogoMark({
  team,
  size = "md",
}: {
  team: TiebreakerMatchupTeam;
  size?: "md" | "sm";
}) {
  const imgClass = size === "sm" ? "w-5 h-5" : "w-8 h-8";
  const textClass = size === "sm" ? "text-[9px] sm:text-[10px]" : "text-sm";
  const label = size === "sm" && team.abbreviation ? team.abbreviation : team.name;
  return (
    <div className="flex items-center gap-1 min-w-0">
      {team.logoUrl ? (
        <img src={team.logoUrl} alt="" className={`${imgClass} object-contain flex-shrink-0`} />
      ) : null}
      <span className={`font-semibold leading-tight truncate ${textClass}`}>{label}</span>
    </div>
  );
}

export function TiebreakerMatchupLogoStrip({
  game,
  tone = "muted",
  size = "md",
  className,
}: {
  game: TiebreakerMatchupGame | null;
  tone?: "muted" | "yellow";
  size?: "md" | "sm";
  className?: string;
}) {
  if (!game) return null;
  const shell =
    tone === "yellow"
      ? "border-yellow-500/30 bg-yellow-500/[0.07]"
      : "border bg-muted/40";
  const atClass = tone === "yellow" ? "text-yellow-500/50" : "text-muted-foreground";
  return (
    <div
      className={`flex items-center justify-center gap-2 sm:gap-3 rounded-lg border px-2 py-2 sm:px-4 sm:py-3 ${shell} ${className ?? ""}`}
    >
      <TeamLogoMark team={game.awayTeam} size={size} />
      <span className={`text-[10px] font-bold flex-shrink-0 ${atClass}`}>@</span>
      <TeamLogoMark team={game.homeTeam} size={size} />
    </div>
  );
}

export function TiebreakerGuessDescription({
  game,
  children,
}: {
  game: TiebreakerMatchupGame | null;
  children: ReactNode;
}) {
  return (
    <DialogDescription className="space-y-2 text-sm text-muted-foreground leading-snug">
      <TiebreakerMatchupHeadline game={game} />
      {children}
    </DialogDescription>
  );
}

export function TiebreakerFieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </label>
  );
}
