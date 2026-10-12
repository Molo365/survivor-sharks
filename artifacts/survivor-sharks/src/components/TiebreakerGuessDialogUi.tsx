import type { ReactNode } from "react";
import { Shuffle } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type TiebreakerMatchupTeam = {
  name: string;
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

export function TiebreakerMatchupLogoStrip({ game }: { game: TiebreakerMatchupGame | null }) {
  if (!game) return null;
  return (
    <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        {game.awayTeam.logoUrl ? (
          <img
            src={game.awayTeam.logoUrl}
            alt=""
            className="w-8 h-8 object-contain flex-shrink-0"
          />
        ) : null}
        <span className="font-semibold text-sm leading-tight">{game.awayTeam.name}</span>
      </div>
      <span className="text-xs font-bold text-muted-foreground flex-shrink-0">@</span>
      <div className="flex items-center gap-2 min-w-0">
        {game.homeTeam.logoUrl ? (
          <img
            src={game.homeTeam.logoUrl}
            alt=""
            className="w-8 h-8 object-contain flex-shrink-0"
          />
        ) : null}
        <span className="font-semibold text-sm leading-tight">{game.homeTeam.name}</span>
      </div>
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
