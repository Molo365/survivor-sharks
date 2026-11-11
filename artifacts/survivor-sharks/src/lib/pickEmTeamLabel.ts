/** Team label on pick tiles when a logo is shown (mascot / last word of ESPN name). */
export function pickEmCompactTeamLabel(team: {
  name: string;
  abbreviation: string;
}): string {
  const parts = team.name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[parts.length - 1]!;
  return team.abbreviation || team.name;
}
