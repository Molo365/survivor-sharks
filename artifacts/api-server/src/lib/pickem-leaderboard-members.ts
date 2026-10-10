export type WeeklySoccerLeaderboardAggregate = {
  userId: number;
  username: string;
  displayName: string | null;
  correct: string | number;
  picked: string | number;
};

/**
 * Weekly MLS / Super League / Champions League leaderboards should list every
 * enrolled member for the active period (ESL-style), with zero-pick players at
 * the bottom of the standings.
 */
export function mergeWeeklySoccerLeaderboardAggregates<T extends WeeklySoccerLeaderboardAggregate>(
  aggregates: T[],
  members: Array<{ userId: number; username: string; displayName: string | null }>,
): T[] {
  if (members.length === 0) return aggregates;

  const byUser = new Map(aggregates.map((row) => [row.userId, row]));
  const merged: T[] = [...aggregates];

  for (const member of members) {
    if (byUser.has(member.userId)) continue;
    merged.push({
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      correct: "0",
      picked: "0",
    } as T);
  }

  merged.sort((a, b) => {
    const correctDiff = Number(b.correct) - Number(a.correct);
    if (correctDiff !== 0) return correctDiff;
    const pickedDiff = Number(b.picked) - Number(a.picked);
    if (pickedDiff !== 0) return pickedDiff;
    const nameA = (a.displayName ?? a.username).toLowerCase();
    const nameB = (b.displayName ?? b.username).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return merged;
}
