import { NflMatchupStatsTrigger, nflMatchupGameFromTeams } from "@/components/NflMatchupStatsTrigger";

type TeamInfo = {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl?: string | null;
};

export function NflConfidenceGridGameHeader({
  game,
  teamLogoSrc,
  season,
}: {
  game: {
    id: string;
    awayTeam: TeamInfo;
    homeTeam: TeamInfo;
    awayScore: number | null;
    homeScore: number | null;
  };
  teamLogoSrc: (team: TeamInfo) => string;
  season?: number;
}) {
  const hasScore = game.awayScore != null && game.homeScore != null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        <img
          src={teamLogoSrc(game.awayTeam)}
          alt={game.awayTeam.abbreviation}
          className="w-4 h-4 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span>{game.awayTeam.abbreviation}</span>
        <span className="text-muted-foreground/40">@</span>
        <span>{game.homeTeam.abbreviation}</span>
        <img
          src={teamLogoSrc(game.homeTeam)}
          alt={game.homeTeam.abbreviation}
          className="w-4 h-4 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      {hasScore && (
        <span className="text-[11px] font-bold text-foreground tabular-nums">
          {game.awayScore}–{game.homeScore}
        </span>
      )}
      <NflMatchupStatsTrigger
        className="mt-0.5"
        season={season}
        game={nflMatchupGameFromTeams(game.id, game.awayTeam, game.homeTeam)}
      />
    </div>
  );
}