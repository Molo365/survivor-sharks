const easternWeekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
});

export function saturdayGamesEt<T extends { date: string }>(games: T[]): T[] {
  return games.filter((game) => easternWeekday.format(new Date(game.date)) === "Saturday");
}

export function nhlSurvivorSlateForSettlement<T extends { date: string }>(games: T[]): T[] {
  const saturdayGames = saturdayGamesEt(games);
  return saturdayGames.length > 0 ? saturdayGames : games;
}