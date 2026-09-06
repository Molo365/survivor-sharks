const SPORT_LOGOS: Record<string, string> = {
  mlb: "/MLB-Logo.png",
  nfl: "/NFL-Logo.png",
  nba: "/NBA-Logo.png",
  nhl: "/NHL-Logo.png",
  worldcup: "/WorldCup2026.png",
  mls: "/MLS_Logo.png",
  superleague: "/European-SuperLeague.jpg",
  championsleague: "/UEFA-Champions-League-Logo.png",
};

export const SPORT_LABELS: Record<string, string> = {
  nfl: "NFL",
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  fifa: "FIFA",
  worldcup: "World Cup",
  intl: "INTL",
  mls: "MLS",
  superleague: "Super League",
  championsleague: "Champions League",
};

export function getSportLogo(sport: string): string | null {
  return SPORT_LOGOS[sport] ?? null;
}

export function SportLogo({
  sport,
  className = "h-5 w-5",
}: {
  sport: string;
  className?: string;
}) {
  const src = getSportLogo(sport);
  if (!src) return null;

  return (
    <img
      src={src}
      alt={`${SPORT_LABELS[sport] ?? sport} logo`}
      className={`${className} object-contain`}
    />
  );
}