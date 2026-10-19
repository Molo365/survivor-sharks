export interface TeamInfo {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

export interface GameSummary {
  id: string;
  awayTeam: TeamInfo;
  homeTeam: TeamInfo;
  startTime: string;
  status: string;
  awayScore: number | null;
  homeScore: number | null;
}

export interface PlayerPick {
  pickedTeamId: string | null;
  pickedTeamName: string | null;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

export interface GridPlayerRow {
  userId: number;
  username: string;
  displayName: string | null;
  picks: Record<string, PlayerPick>;
  weeklyTiebreakerGuess?: number | null;
}

export interface WeeklyTiebreakerGridMeta {
  columnHeader: string | null;
  actual: number | null;
  tiebreakerMatchup?: {
    awayTeam: { name: string; abbreviation?: string; logoUrl?: string | null };
    homeTeam: { name: string; abbreviation?: string; logoUrl?: string | null };
    startTime?: string | null;
  };
}

export interface ConfidenceGridResponse {
  week: number;
  games: GameSummary[];
  players: GridPlayerRow[];
  weeklyTiebreaker?: WeeklyTiebreakerGridMeta;
}

export interface ConfidenceLeaderboardPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  weekPoints: number;
  seasonPoints?: number;
}

export interface ConfidenceLeaderboardResponse {
  week: number;
  players: ConfidenceLeaderboardPlayer[];
}
