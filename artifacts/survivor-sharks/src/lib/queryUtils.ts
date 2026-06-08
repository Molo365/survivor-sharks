import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidates every cached query that belongs to a specific pool.
 * All pool-scoped API routes share the prefix `/api/pools/${poolId}/`,
 * so one predicate covers all tabs (leaderboard, grid, picks, stats,
 * kill-history, eliminations, schedule, pick-em, WC, etc.) without
 * needing to enumerate individual query keys.
 *
 * Call this after any successful pick submission or pool data mutation.
 */
export function invalidatePoolQueries(
  queryClient: QueryClient,
  poolId: number,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey.some(
        (k) =>
          typeof k === "string" &&
          k.startsWith(`/api/pools/${poolId}/`),
      ),
  });
}
