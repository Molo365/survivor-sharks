import { ESPN_TEAMS, getTeamLogoUrl, type TeamRecord } from "./teams-data";

export const NHL_DIVISIONS = ["Atlantic", "Metropolitan", "Central", "Pacific"] as const;
export type NhlDivisionName = (typeof NHL_DIVISIONS)[number];
export interface NhlDivision { name: NhlDivisionName; shortName: string; teams: TeamRecord[]; }
export const NHL_DIVISION_MAP = new Map<NhlDivisionName, NhlDivision>(
  NHL_DIVISIONS.map((name) => [name, {
    name, shortName: name,
    teams: ESPN_TEAMS.nhl.filter((team) => team.division === name),
  }]),
);
for (const division of NHL_DIVISION_MAP.values()) {
  if (division.teams.length !== 8) {
    throw new Error(`NHL Division Predictor requires eight teams in ${division.name}`);
  }
}
export function nhlTeamPresentation(team: TeamRecord) {
  return { name: team.name, abbr: team.abbreviation, logoUrl: getTeamLogoUrl("nhl", team) };
}