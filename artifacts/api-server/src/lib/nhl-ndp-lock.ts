import { fetchFirstNhlSeasonTypeGameDate } from "./espn";

export type NhlNdpLockSource = "espn" | "cache" | "fallback" | "sandbox";
export interface NhlNdpLockState { lockAt: Date | null; locked: boolean; source: NhlNdpLockSource; }
export const NHL_NDP_LOCK_FALLBACK = new Date("2026-09-29T00:00:00.000Z");
const cache = new Map<number, Date>();
type FetchFirstGameDate = (season: number, seasonType: number) => Promise<string | null>;
export async function resolveNhlNdpLock(season: number, options: { fetchFirstGameDate?: FetchFirstGameDate; now?: Date } = {}): Promise<NhlNdpLockState> {
  const now = options.now ?? new Date();
  const cached = cache.get(season);
  if (cached) return { lockAt: cached, locked: now >= cached, source: "cache" };
  try {
    const firstGameDate = await (options.fetchFirstGameDate ?? fetchFirstNhlSeasonTypeGameDate)(season, 2);
    if (firstGameDate && Number.isFinite(Date.parse(firstGameDate))) {
      const lockAt = new Date(firstGameDate);
      cache.set(season, lockAt);
      return { lockAt, locked: now >= lockAt, source: "espn" };
    }
  } catch { /* fail closed to the published fallback */ }
  const fallback = season === 2026 ? NHL_NDP_LOCK_FALLBACK : new Date(`${season}-09-29T00:00:00.000Z`);
  return { lockAt: fallback, locked: now >= fallback, source: "fallback" };
}
export function getNhlNdpLockState(season: number, sandboxMode: boolean, options: { fetchFirstGameDate?: FetchFirstGameDate; now?: Date } = {}) {
  return sandboxMode ? Promise.resolve<NhlNdpLockState>({ lockAt: null, locked: false, source: "sandbox" }) : resolveNhlNdpLock(season, options);
}
export function clearNhlNdpLockCacheForTests() { cache.clear(); }