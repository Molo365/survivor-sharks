/** ESPN tri-code for NHL pick tiles when the logo is shown (SEA, FLA, LAK). */
export function pickEmNhlMobileTeamCode(team: {
  name: string;
  abbreviation: string;
}): string {
  const code = team.abbreviation?.trim();
  if (code) return code;
  return team.name;
}
