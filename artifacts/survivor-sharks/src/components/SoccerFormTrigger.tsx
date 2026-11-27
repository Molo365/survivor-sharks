import { useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import {
  SoccerMatchupFormDialog,
  type SoccerMatchupFormGame,
} from "@/components/SoccerMatchupFormDialog";

export function SoccerFormButton({
  className,
  onClick,
}: {
  className?: string;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider",
        "border border-blue-500/45 bg-blue-500/15 text-blue-300",
        "hover:bg-blue-500/25 hover:border-blue-500/60 transition-colors leading-none whitespace-nowrap",
        className,
      )}
      title="Recent team form"
      aria-label="Open team form"
    >
      Form
    </button>
  );
}

export function SoccerFormTrigger({
  sport,
  game,
  className,
}: {
  sport: string;
  game: SoccerMatchupFormGame;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SoccerFormButton className={className} onClick={() => setOpen(true)} />
      <SoccerMatchupFormDialog
        open={open}
        onOpenChange={setOpen}
        sport={sport}
        game={open ? game : null}
      />
    </>
  );
}

export function soccerFormGameFromPickEm(game: {
  awayTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null };
  homeTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null };
}): SoccerMatchupFormGame {
  return {
    awayTeam: {
      id: game.awayTeam.id,
      abbreviation: game.awayTeam.abbreviation,
      name: game.awayTeam.name,
      logoUrl: game.awayTeam.logoUrl,
    },
    homeTeam: {
      id: game.homeTeam.id,
      abbreviation: game.homeTeam.abbreviation,
      name: game.homeTeam.name,
      logoUrl: game.homeTeam.logoUrl,
    },
  };
}