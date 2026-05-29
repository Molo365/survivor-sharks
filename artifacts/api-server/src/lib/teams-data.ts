export type Sport = "nfl" | "mlb" | "nba" | "nhl" | "fifa";

export interface TeamRecord {
  id: string;
  name: string;
  abbreviation: string;
  location: string;
  conference?: string;
  division?: string;
}

export const ESPN_TEAMS: Record<Sport, TeamRecord[]> = {
  nfl: [
    { id: "22", name: "Arizona Cardinals",     abbreviation: "ARI", location: "Arizona",       conference: "NFC", division: "West" },
    { id: "1",  name: "Atlanta Falcons",        abbreviation: "ATL", location: "Atlanta",        conference: "NFC", division: "South" },
    { id: "33", name: "Baltimore Ravens",       abbreviation: "BAL", location: "Baltimore",      conference: "AFC", division: "North" },
    { id: "2",  name: "Buffalo Bills",          abbreviation: "BUF", location: "Buffalo",        conference: "AFC", division: "East" },
    { id: "29", name: "Carolina Panthers",      abbreviation: "CAR", location: "Carolina",       conference: "NFC", division: "South" },
    { id: "3",  name: "Chicago Bears",          abbreviation: "CHI", location: "Chicago",        conference: "NFC", division: "North" },
    { id: "4",  name: "Cincinnati Bengals",     abbreviation: "CIN", location: "Cincinnati",     conference: "AFC", division: "North" },
    { id: "5",  name: "Cleveland Browns",       abbreviation: "CLE", location: "Cleveland",      conference: "AFC", division: "North" },
    { id: "6",  name: "Dallas Cowboys",         abbreviation: "DAL", location: "Dallas",         conference: "NFC", division: "East" },
    { id: "7",  name: "Denver Broncos",         abbreviation: "DEN", location: "Denver",         conference: "AFC", division: "West" },
    { id: "8",  name: "Detroit Lions",          abbreviation: "DET", location: "Detroit",        conference: "NFC", division: "North" },
    { id: "9",  name: "Green Bay Packers",      abbreviation: "GB",  location: "Green Bay",      conference: "NFC", division: "North" },
    { id: "34", name: "Houston Texans",         abbreviation: "HOU", location: "Houston",        conference: "AFC", division: "South" },
    { id: "11", name: "Indianapolis Colts",     abbreviation: "IND", location: "Indianapolis",   conference: "AFC", division: "South" },
    { id: "30", name: "Jacksonville Jaguars",   abbreviation: "JAX", location: "Jacksonville",   conference: "AFC", division: "South" },
    { id: "12", name: "Kansas City Chiefs",     abbreviation: "KC",  location: "Kansas City",    conference: "AFC", division: "West" },
    { id: "13", name: "Las Vegas Raiders",      abbreviation: "LV",  location: "Las Vegas",      conference: "AFC", division: "West" },
    { id: "24", name: "Los Angeles Chargers",   abbreviation: "LAC", location: "Los Angeles",    conference: "AFC", division: "West" },
    { id: "14", name: "Los Angeles Rams",       abbreviation: "LAR", location: "Los Angeles",    conference: "NFC", division: "West" },
    { id: "15", name: "Miami Dolphins",         abbreviation: "MIA", location: "Miami",          conference: "AFC", division: "East" },
    { id: "16", name: "Minnesota Vikings",      abbreviation: "MIN", location: "Minnesota",      conference: "NFC", division: "North" },
    { id: "17", name: "New England Patriots",   abbreviation: "NE",  location: "New England",    conference: "AFC", division: "East" },
    { id: "18", name: "New Orleans Saints",     abbreviation: "NO",  location: "New Orleans",    conference: "NFC", division: "South" },
    { id: "19", name: "New York Giants",        abbreviation: "NYG", location: "New York",       conference: "NFC", division: "East" },
    { id: "20", name: "New York Jets",          abbreviation: "NYJ", location: "New York",       conference: "AFC", division: "East" },
    { id: "21", name: "Philadelphia Eagles",    abbreviation: "PHI", location: "Philadelphia",   conference: "NFC", division: "East" },
    { id: "23", name: "Pittsburgh Steelers",    abbreviation: "PIT", location: "Pittsburgh",     conference: "AFC", division: "North" },
    { id: "25", name: "San Francisco 49ers",    abbreviation: "SF",  location: "San Francisco",  conference: "NFC", division: "West" },
    { id: "26", name: "Seattle Seahawks",       abbreviation: "SEA", location: "Seattle",        conference: "NFC", division: "West" },
    { id: "27", name: "Tampa Bay Buccaneers",   abbreviation: "TB",  location: "Tampa Bay",      conference: "NFC", division: "South" },
    { id: "10", name: "Tennessee Titans",       abbreviation: "TEN", location: "Tennessee",      conference: "AFC", division: "South" },
    { id: "28", name: "Washington Commanders",  abbreviation: "WSH", location: "Washington",     conference: "NFC", division: "East" },
  ],
  nba: [
    { id: "1",  name: "Atlanta Hawks",           abbreviation: "ATL", location: "Atlanta",        conference: "East", division: "Southeast" },
    { id: "2",  name: "Boston Celtics",          abbreviation: "BOS", location: "Boston",         conference: "East", division: "Atlantic" },
    { id: "3",  name: "Brooklyn Nets",           abbreviation: "BKN", location: "Brooklyn",       conference: "East", division: "Atlantic" },
    { id: "4",  name: "Charlotte Hornets",       abbreviation: "CHA", location: "Charlotte",      conference: "East", division: "Southeast" },
    { id: "5",  name: "Chicago Bulls",           abbreviation: "CHI", location: "Chicago",        conference: "East", division: "Central" },
    { id: "6",  name: "Cleveland Cavaliers",     abbreviation: "CLE", location: "Cleveland",      conference: "East", division: "Central" },
    { id: "7",  name: "Dallas Mavericks",        abbreviation: "DAL", location: "Dallas",         conference: "West", division: "Southwest" },
    { id: "8",  name: "Denver Nuggets",          abbreviation: "DEN", location: "Denver",         conference: "West", division: "Northwest" },
    { id: "9",  name: "Detroit Pistons",         abbreviation: "DET", location: "Detroit",        conference: "East", division: "Central" },
    { id: "10", name: "Golden State Warriors",   abbreviation: "GSW", location: "Golden State",   conference: "West", division: "Pacific" },
    { id: "11", name: "Houston Rockets",         abbreviation: "HOU", location: "Houston",        conference: "West", division: "Southwest" },
    { id: "12", name: "Indiana Pacers",          abbreviation: "IND", location: "Indiana",        conference: "East", division: "Central" },
    { id: "13", name: "LA Clippers",             abbreviation: "LAC", location: "Los Angeles",    conference: "West", division: "Pacific" },
    { id: "14", name: "Los Angeles Lakers",      abbreviation: "LAL", location: "Los Angeles",    conference: "West", division: "Pacific" },
    { id: "15", name: "Memphis Grizzlies",       abbreviation: "MEM", location: "Memphis",        conference: "West", division: "Southwest" },
    { id: "16", name: "Miami Heat",              abbreviation: "MIA", location: "Miami",          conference: "East", division: "Southeast" },
    { id: "17", name: "Milwaukee Bucks",         abbreviation: "MIL", location: "Milwaukee",      conference: "East", division: "Central" },
    { id: "18", name: "Minnesota Timberwolves",  abbreviation: "MIN", location: "Minnesota",      conference: "West", division: "Northwest" },
    { id: "19", name: "New Orleans Pelicans",    abbreviation: "NOP", location: "New Orleans",    conference: "West", division: "Southwest" },
    { id: "20", name: "New York Knicks",         abbreviation: "NYK", location: "New York",       conference: "East", division: "Atlantic" },
    { id: "21", name: "Oklahoma City Thunder",   abbreviation: "OKC", location: "Oklahoma City",  conference: "West", division: "Northwest" },
    { id: "22", name: "Orlando Magic",           abbreviation: "ORL", location: "Orlando",        conference: "East", division: "Southeast" },
    { id: "23", name: "Philadelphia 76ers",      abbreviation: "PHI", location: "Philadelphia",   conference: "East", division: "Atlantic" },
    { id: "24", name: "Phoenix Suns",            abbreviation: "PHX", location: "Phoenix",        conference: "West", division: "Pacific" },
    { id: "25", name: "Portland Trail Blazers",  abbreviation: "POR", location: "Portland",       conference: "West", division: "Northwest" },
    { id: "26", name: "Sacramento Kings",        abbreviation: "SAC", location: "Sacramento",     conference: "West", division: "Pacific" },
    { id: "27", name: "San Antonio Spurs",       abbreviation: "SAS", location: "San Antonio",    conference: "West", division: "Southwest" },
    { id: "28", name: "Toronto Raptors",         abbreviation: "TOR", location: "Toronto",        conference: "East", division: "Atlantic" },
    { id: "29", name: "Utah Jazz",               abbreviation: "UTA", location: "Utah",           conference: "West", division: "Northwest" },
    { id: "30", name: "Washington Wizards",      abbreviation: "WAS", location: "Washington",     conference: "East", division: "Southeast" },
  ],
  mlb: [
    { id: "1",  name: "Arizona Diamondbacks",  abbreviation: "ARI", location: "Arizona",      conference: "NL", division: "West" },
    { id: "2",  name: "Atlanta Braves",        abbreviation: "ATL", location: "Atlanta",       conference: "NL", division: "East" },
    { id: "3",  name: "Baltimore Orioles",     abbreviation: "BAL", location: "Baltimore",     conference: "AL", division: "East" },
    { id: "4",  name: "Boston Red Sox",        abbreviation: "BOS", location: "Boston",        conference: "AL", division: "East" },
    { id: "5",  name: "Chicago Cubs",          abbreviation: "CHC", location: "Chicago",       conference: "NL", division: "Central" },
    { id: "6",  name: "Chicago White Sox",     abbreviation: "CWS", location: "Chicago",       conference: "AL", division: "Central" },
    { id: "7",  name: "Cincinnati Reds",       abbreviation: "CIN", location: "Cincinnati",    conference: "NL", division: "Central" },
    { id: "8",  name: "Cleveland Guardians",   abbreviation: "CLE", location: "Cleveland",     conference: "AL", division: "Central" },
    { id: "9",  name: "Colorado Rockies",      abbreviation: "COL", location: "Colorado",      conference: "NL", division: "West" },
    { id: "10", name: "Detroit Tigers",        abbreviation: "DET", location: "Detroit",       conference: "AL", division: "Central" },
    { id: "11", name: "Houston Astros",        abbreviation: "HOU", location: "Houston",       conference: "AL", division: "West" },
    { id: "12", name: "Kansas City Royals",    abbreviation: "KC",  location: "Kansas City",   conference: "AL", division: "Central" },
    { id: "13", name: "Los Angeles Angels",    abbreviation: "LAA", location: "Los Angeles",   conference: "AL", division: "West" },
    { id: "14", name: "Los Angeles Dodgers",   abbreviation: "LAD", location: "Los Angeles",   conference: "NL", division: "West" },
    { id: "15", name: "Miami Marlins",         abbreviation: "MIA", location: "Miami",         conference: "NL", division: "East" },
    { id: "16", name: "Milwaukee Brewers",     abbreviation: "MIL", location: "Milwaukee",     conference: "NL", division: "Central" },
    { id: "17", name: "Minnesota Twins",       abbreviation: "MIN", location: "Minnesota",     conference: "AL", division: "Central" },
    { id: "18", name: "New York Mets",         abbreviation: "NYM", location: "New York",      conference: "NL", division: "East" },
    { id: "19", name: "New York Yankees",      abbreviation: "NYY", location: "New York",      conference: "AL", division: "East" },
    { id: "20", name: "Oakland Athletics",     abbreviation: "OAK", location: "Oakland",       conference: "AL", division: "West" },
    { id: "21", name: "Philadelphia Phillies", abbreviation: "PHI", location: "Philadelphia",  conference: "NL", division: "East" },
    { id: "22", name: "Pittsburgh Pirates",    abbreviation: "PIT", location: "Pittsburgh",    conference: "NL", division: "Central" },
    { id: "23", name: "San Diego Padres",      abbreviation: "SD",  location: "San Diego",     conference: "NL", division: "West" },
    { id: "24", name: "San Francisco Giants",  abbreviation: "SF",  location: "San Francisco", conference: "NL", division: "West" },
    { id: "25", name: "Seattle Mariners",      abbreviation: "SEA", location: "Seattle",       conference: "AL", division: "West" },
    { id: "26", name: "St. Louis Cardinals",   abbreviation: "STL", location: "St. Louis",     conference: "NL", division: "Central" },
    { id: "27", name: "Tampa Bay Rays",        abbreviation: "TB",  location: "Tampa Bay",     conference: "AL", division: "East" },
    { id: "28", name: "Texas Rangers",         abbreviation: "TEX", location: "Texas",         conference: "AL", division: "West" },
    { id: "29", name: "Toronto Blue Jays",     abbreviation: "TOR", location: "Toronto",       conference: "AL", division: "East" },
    { id: "30", name: "Washington Nationals",  abbreviation: "WSH", location: "Washington",    conference: "NL", division: "East" },
  ],
  nhl: [
    { id: "1",  name: "Anaheim Ducks",         abbreviation: "ANA", location: "Anaheim",      conference: "West", division: "Pacific" },
    { id: "2",  name: "Boston Bruins",          abbreviation: "BOS", location: "Boston",       conference: "East", division: "Atlantic" },
    { id: "3",  name: "Buffalo Sabres",         abbreviation: "BUF", location: "Buffalo",      conference: "East", division: "Atlantic" },
    { id: "4",  name: "Calgary Flames",         abbreviation: "CGY", location: "Calgary",      conference: "West", division: "Pacific" },
    { id: "5",  name: "Carolina Hurricanes",    abbreviation: "CAR", location: "Carolina",     conference: "East", division: "Metropolitan" },
    { id: "6",  name: "Chicago Blackhawks",     abbreviation: "CHI", location: "Chicago",      conference: "West", division: "Central" },
    { id: "7",  name: "Colorado Avalanche",     abbreviation: "COL", location: "Colorado",     conference: "West", division: "Central" },
    { id: "8",  name: "Columbus Blue Jackets",  abbreviation: "CBJ", location: "Columbus",     conference: "East", division: "Metropolitan" },
    { id: "9",  name: "Dallas Stars",           abbreviation: "DAL", location: "Dallas",       conference: "West", division: "Central" },
    { id: "10", name: "Detroit Red Wings",      abbreviation: "DET", location: "Detroit",      conference: "East", division: "Atlantic" },
    { id: "11", name: "Edmonton Oilers",        abbreviation: "EDM", location: "Edmonton",     conference: "West", division: "Pacific" },
    { id: "12", name: "Florida Panthers",       abbreviation: "FLA", location: "Florida",      conference: "East", division: "Atlantic" },
    { id: "13", name: "Los Angeles Kings",      abbreviation: "LAK", location: "Los Angeles",  conference: "West", division: "Pacific" },
    { id: "14", name: "Minnesota Wild",         abbreviation: "MIN", location: "Minnesota",    conference: "West", division: "Central" },
    { id: "15", name: "Montreal Canadiens",     abbreviation: "MTL", location: "Montreal",     conference: "East", division: "Atlantic" },
    { id: "16", name: "Nashville Predators",    abbreviation: "NSH", location: "Nashville",    conference: "West", division: "Central" },
    { id: "17", name: "New Jersey Devils",      abbreviation: "NJD", location: "New Jersey",   conference: "East", division: "Metropolitan" },
    { id: "18", name: "New York Islanders",     abbreviation: "NYI", location: "New York",     conference: "East", division: "Metropolitan" },
    { id: "19", name: "New York Rangers",       abbreviation: "NYR", location: "New York",     conference: "East", division: "Metropolitan" },
    { id: "20", name: "Ottawa Senators",        abbreviation: "OTT", location: "Ottawa",       conference: "East", division: "Atlantic" },
    { id: "21", name: "Philadelphia Flyers",    abbreviation: "PHI", location: "Philadelphia", conference: "East", division: "Metropolitan" },
    { id: "22", name: "Pittsburgh Penguins",    abbreviation: "PIT", location: "Pittsburgh",   conference: "East", division: "Metropolitan" },
    { id: "23", name: "San Jose Sharks",        abbreviation: "SJS", location: "San Jose",     conference: "West", division: "Pacific" },
    { id: "24", name: "Seattle Kraken",         abbreviation: "SEA", location: "Seattle",      conference: "West", division: "Pacific" },
    { id: "25", name: "St. Louis Blues",        abbreviation: "STL", location: "St. Louis",    conference: "West", division: "Central" },
    { id: "26", name: "Tampa Bay Lightning",    abbreviation: "TBL", location: "Tampa Bay",    conference: "East", division: "Atlantic" },
    { id: "27", name: "Toronto Maple Leafs",    abbreviation: "TOR", location: "Toronto",      conference: "East", division: "Atlantic" },
    { id: "28", name: "Utah Hockey Club",       abbreviation: "UTA", location: "Utah",         conference: "West", division: "Central" },
    { id: "29", name: "Vancouver Canucks",      abbreviation: "VAN", location: "Vancouver",    conference: "West", division: "Pacific" },
    { id: "30", name: "Vegas Golden Knights",   abbreviation: "VGK", location: "Vegas",        conference: "West", division: "Pacific" },
    { id: "31", name: "Washington Capitals",    abbreviation: "WSH", location: "Washington",   conference: "East", division: "Metropolitan" },
    { id: "32", name: "Winnipeg Jets",          abbreviation: "WPG", location: "Winnipeg",     conference: "West", division: "Central" },
  ],
  fifa: [
    { id: "us",    name: "United States",  abbreviation: "USA", location: "North America" },
    { id: "br",    name: "Brazil",         abbreviation: "BRA", location: "South America" },
    { id: "ar",    name: "Argentina",      abbreviation: "ARG", location: "South America" },
    { id: "fr",    name: "France",         abbreviation: "FRA", location: "Europe" },
    { id: "de",    name: "Germany",        abbreviation: "GER", location: "Europe" },
    { id: "es",    name: "Spain",          abbreviation: "ESP", location: "Europe" },
    { id: "gb-eng",name: "England",        abbreviation: "ENG", location: "Europe" },
    { id: "pt",    name: "Portugal",       abbreviation: "POR", location: "Europe" },
    { id: "nl",    name: "Netherlands",    abbreviation: "NED", location: "Europe" },
    { id: "it",    name: "Italy",          abbreviation: "ITA", location: "Europe" },
    { id: "be",    name: "Belgium",        abbreviation: "BEL", location: "Europe" },
    { id: "hr",    name: "Croatia",        abbreviation: "CRO", location: "Europe" },
    { id: "ma",    name: "Morocco",        abbreviation: "MAR", location: "Africa" },
    { id: "sn",    name: "Senegal",        abbreviation: "SEN", location: "Africa" },
    { id: "gh",    name: "Ghana",          abbreviation: "GHA", location: "Africa" },
    { id: "jp",    name: "Japan",          abbreviation: "JPN", location: "Asia" },
    { id: "kr",    name: "South Korea",    abbreviation: "KOR", location: "Asia" },
    { id: "au",    name: "Australia",      abbreviation: "AUS", location: "Oceania" },
    { id: "mx",    name: "Mexico",         abbreviation: "MEX", location: "North America" },
    { id: "ca",    name: "Canada",         abbreviation: "CAN", location: "North America" },
    { id: "uy",    name: "Uruguay",        abbreviation: "URU", location: "South America" },
    { id: "co",    name: "Colombia",       abbreviation: "COL", location: "South America" },
    { id: "cl",    name: "Chile",          abbreviation: "CHI", location: "South America" },
    { id: "ec",    name: "Ecuador",        abbreviation: "ECU", location: "South America" },
    { id: "ch",    name: "Switzerland",    abbreviation: "SUI", location: "Europe" },
    { id: "pl",    name: "Poland",         abbreviation: "POL", location: "Europe" },
    { id: "dk",    name: "Denmark",        abbreviation: "DEN", location: "Europe" },
    { id: "se",    name: "Sweden",         abbreviation: "SWE", location: "Europe" },
    { id: "ng",    name: "Nigeria",        abbreviation: "NGA", location: "Africa" },
    { id: "cm",    name: "Cameroon",       abbreviation: "CMR", location: "Africa" },
    { id: "ir",    name: "Iran",           abbreviation: "IRN", location: "Asia" },
    { id: "sa",    name: "Saudi Arabia",   abbreviation: "KSA", location: "Asia" },
  ],
};

export function getLogoUrl(sport: Sport, abbreviation: string): string {
  if (sport === "fifa") {
    return `https://flagcdn.com/w80/${abbreviation.toLowerCase()}.png`;
  }
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbreviation.toLowerCase()}.png`;
}

/**
 * Look up a team by its ID and return resolved name, abbreviation, and logo URL.
 * Falls back gracefully if the ID isn't found in static data.
 */
export function resolveTeam(
  sport: string,
  teamId: string,
): { teamName: string; abbreviation: string; teamLogoUrl: string } {
  const sportKey = sport as Sport;
  const teams = ESPN_TEAMS[sportKey] ?? [];
  const team = teams.find(t => t.id === teamId);

  if (team) {
    return {
      teamName: team.name,
      abbreviation: team.abbreviation,
      teamLogoUrl: getLogoUrl(sportKey, team.abbreviation),
    };
  }

  // Unknown ID — best-effort fallback
  return {
    teamName: teamId,
    abbreviation: teamId.toUpperCase().slice(0, 4),
    teamLogoUrl: sport === "fifa"
      ? `https://flagcdn.com/w80/${teamId.toLowerCase()}.png`
      : `https://a.espncdn.com/i/teamlogos/${sport}/500/${teamId.toLowerCase()}.png`,
  };
}
