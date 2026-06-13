export interface NflTeam {
  name: string;
  abbr: string;
  logoUrl: string;
}

export interface NflDivision {
  name: string;         // e.g. "AFC East"
  shortName: string;    // e.g. "AFC-E"
  teams: [NflTeam, NflTeam, NflTeam, NflTeam];
}

function logo(espnAbbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnAbbr.toLowerCase()}.png`;
}

export const NFL_DIVISIONS: NflDivision[] = [
  {
    name: "AFC East",
    shortName: "AFC-E",
    teams: [
      { name: "Buffalo Bills",       abbr: "BUF", logoUrl: logo("buf") },
      { name: "Miami Dolphins",      abbr: "MIA", logoUrl: logo("mia") },
      { name: "New England Patriots",abbr: "NE",  logoUrl: logo("ne")  },
      { name: "New York Jets",       abbr: "NYJ", logoUrl: logo("nyj") },
    ],
  },
  {
    name: "AFC North",
    shortName: "AFC-N",
    teams: [
      { name: "Baltimore Ravens",    abbr: "BAL", logoUrl: logo("bal") },
      { name: "Cincinnati Bengals",  abbr: "CIN", logoUrl: logo("cin") },
      { name: "Cleveland Browns",    abbr: "CLE", logoUrl: logo("cle") },
      { name: "Pittsburgh Steelers", abbr: "PIT", logoUrl: logo("pit") },
    ],
  },
  {
    name: "AFC South",
    shortName: "AFC-S",
    teams: [
      { name: "Houston Texans",      abbr: "HOU", logoUrl: logo("hou") },
      { name: "Indianapolis Colts",  abbr: "IND", logoUrl: logo("ind") },
      { name: "Jacksonville Jaguars",abbr: "JAX", logoUrl: logo("jax") },
      { name: "Tennessee Titans",    abbr: "TEN", logoUrl: logo("ten") },
    ],
  },
  {
    name: "AFC West",
    shortName: "AFC-W",
    teams: [
      { name: "Denver Broncos",      abbr: "DEN", logoUrl: logo("den") },
      { name: "Kansas City Chiefs",  abbr: "KC",  logoUrl: logo("kc")  },
      { name: "Las Vegas Raiders",   abbr: "LV",  logoUrl: logo("lv")  },
      { name: "Los Angeles Chargers",abbr: "LAC", logoUrl: logo("lac") },
    ],
  },
  {
    name: "NFC East",
    shortName: "NFC-E",
    teams: [
      { name: "Dallas Cowboys",       abbr: "DAL", logoUrl: logo("dal") },
      { name: "New York Giants",      abbr: "NYG", logoUrl: logo("nyg") },
      { name: "Philadelphia Eagles",  abbr: "PHI", logoUrl: logo("phi") },
      { name: "Washington Commanders",abbr: "WSH", logoUrl: logo("wsh") },
    ],
  },
  {
    name: "NFC North",
    shortName: "NFC-N",
    teams: [
      { name: "Chicago Bears",        abbr: "CHI", logoUrl: logo("chi") },
      { name: "Detroit Lions",        abbr: "DET", logoUrl: logo("det") },
      { name: "Green Bay Packers",    abbr: "GB",  logoUrl: logo("gb")  },
      { name: "Minnesota Vikings",    abbr: "MIN", logoUrl: logo("min") },
    ],
  },
  {
    name: "NFC South",
    shortName: "NFC-S",
    teams: [
      { name: "Atlanta Falcons",      abbr: "ATL", logoUrl: logo("atl") },
      { name: "Carolina Panthers",    abbr: "CAR", logoUrl: logo("car") },
      { name: "New Orleans Saints",   abbr: "NO",  logoUrl: logo("no")  },
      { name: "Tampa Bay Buccaneers", abbr: "TB",  logoUrl: logo("tb")  },
    ],
  },
  {
    name: "NFC West",
    shortName: "NFC-W",
    teams: [
      { name: "Arizona Cardinals",    abbr: "ARI", logoUrl: logo("ari") },
      { name: "Los Angeles Rams",     abbr: "LAR", logoUrl: logo("lar") },
      { name: "San Francisco 49ers",  abbr: "SF",  logoUrl: logo("sf")  },
      { name: "Seattle Seahawks",     abbr: "SEA", logoUrl: logo("sea") },
    ],
  },
];

export const NFL_DIVISION_MAP = new Map<string, NflDivision>(
  NFL_DIVISIONS.map((d) => [d.name, d]),
);
