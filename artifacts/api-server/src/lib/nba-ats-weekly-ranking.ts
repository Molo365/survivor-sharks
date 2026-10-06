/** Order finish groups by correct ATS picks, breaking ties with total victory margin. */
export function rankNbaAtsUsersByWeeklyScore(
  scoreByUser: Map<number, number>,
  marginByUser: Map<number, number>,
): number[][] {
  const byScore = new Map<number, number[]>();
  for (const [userId, correct] of scoreByUser) {
    if (!byScore.has(correct)) byScore.set(correct, []);
    byScore.get(correct)!.push(userId);
  }
  const sortedScores = [...byScore.keys()].sort((a, b) => b - a);

  const groups: number[][] = [];
  for (const score of sortedScores) {
    const usersAtScore = byScore.get(score)!;
    if (usersAtScore.length === 1) {
      groups.push(usersAtScore);
      continue;
    }
    const ranked = usersAtScore
      .map((uid) => ({ userId: uid, margin: marginByUser.get(uid) ?? 0 }))
      .sort((a, b) => b.margin - a.margin);

    let i = 0;
    while (i < ranked.length) {
      const topMargin = ranked[i]!.margin;
      const coGroup: number[] = [];
      while (i < ranked.length && ranked[i]!.margin === topMargin) {
        coGroup.push(ranked[i]!.userId);
        i++;
      }
      groups.push(coGroup);
    }
  }
  return groups;
}

export function nbaAtsWeeklyPeriodReason(groups: number[][]): string {
  if (groups.length === 0) return "no picks";
  const firstGroup = groups[0] ?? [];
  if (firstGroup.length > 1) return "co-winners";
  return "outright winner";
}
