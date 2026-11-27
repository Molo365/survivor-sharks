import { useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { NhlTeamMatchupDialog, type NhlMatchupDialogGame } from "@/components/NhlTeamMatchupDialog";
import { nhlSeasonYearFromDate } from "@/lib/nhlSeasonYear";

export function nhlMatchupGameFromTeams(
  gameId: string,
  awayTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null },
  homeTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null },
): NhlMatchupDialogGame {
  return {
    id: gameId,
    awayTeam: {
      id: awayTeam.id,
      abbreviation: awayTeam.abbreviation,
      name: awayTeam.name,
      logoUrl: awayTeam.logoUrl,
    },
    homeTeam: {
      id: homeTeam.id,
      abbreviation: homeTeam.abbreviation,
      name: homeTeam.name,
      logoUrl: homeTeam.logoUrl,
    },
  };
}

export function NhlMatchupStatsButton({
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
        "border border-green-500/45 bg-green-500/15 text-green-400",
        "hover:bg-green-500/25 hover:border-green-500/60 transition-colors leading-none whitespace-nowrap",
        className,
      )}
      title="Season team stats"
      aria-label="Open season team stats"
    >
      Stats
    </button>
  );
}

/** Green Stats pill + season stats modal for an NHL matchup row. */
export function NhlMatchupStatsTrigger({
  game,
  season,
  className,
}: {
  game: NhlMatchupDialogGame;
  season?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const year = season ?? nhlSeasonYearFromDate();

  return (
    <>
      <NhlMatchupStatsButton className={className} onClick={() => setOpen(true)} />
      <NhlTeamMatchupDialog
        open={open}
        onOpenChange={setOpen}
        season={year}
        game={open ? game : null}
      />
    </>
  );
}