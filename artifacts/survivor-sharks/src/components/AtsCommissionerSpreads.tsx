/**
 * AtsCommissionerSpreads — commissioner panel section for NBA Weekend ATS pools.
 * Allows the commissioner to enter or update spread lines for each game in the
 * current weekend's slate before games start.
 *
 * Uses raw fetch because the generated API client doesn't include the ats-spreads
 * endpoints (they're not in the OpenAPI spec yet).
 */
import React, { useState, useEffect } from "react";
import type { PickEmGame } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save } from "lucide-react";

interface SpreadEntry {
  spread: string;       // raw input value, e.g. "6.5"
  favoriteTeamId: string; // ESPN team ID of the favourite
}

interface AtsCommissionerSpreadsProps {
  poolId: number;
  games: PickEmGame[];
}

export function AtsCommissionerSpreads({ poolId, games }: AtsCommissionerSpreadsProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Record<string, SpreadEntry>>({});
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);

  // Pre-populate inputs with the existing commissioner spreads
  useEffect(() => {
    if (games.length === 0) return;
    setLoadingFetch(true);
    const token = localStorage.getItem("auth_token");
    fetch(`/api/pools/${poolId}/pickem/ats-spreads`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data: { week: number; spreads: Array<{ gameId: string; spread: number; favoriteTeamId: string }> }) => {
        const next: Record<string, SpreadEntry> = {};
        // Pre-populate with whatever the server already has
        for (const row of data.spreads ?? []) {
          next[row.gameId] = { spread: String(row.spread), favoriteTeamId: row.favoriteTeamId };
        }
        // Default unset games to the home team as favourite, empty spread
        for (const g of games) {
          if (!next[g.id]) {
            next[g.id] = { spread: "", favoriteTeamId: g.homeTeam.id };
          }
        }
        setEntries(next);
      })
      .catch(() => {
        // Initialize defaults even on error
        const next: Record<string, SpreadEntry> = {};
        for (const g of games) {
          next[g.id] = { spread: "", favoriteTeamId: g.homeTeam.id };
        }
        setEntries(next);
      })
      .finally(() => setLoadingFetch(false));
  }, [poolId, games.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateEntry(gameId: string, partial: Partial<SpreadEntry>) {
    setEntries((prev) => ({ ...prev, [gameId]: { ...prev[gameId]!, ...partial } }));
  }

  async function handleSave() {
    const spreads: Array<{ gameId: string; spread: number; favoriteTeamId: string }> = [];
    for (const [gameId, entry] of Object.entries(entries)) {
      const spread = parseFloat(entry.spread);
      if (!isNaN(spread) && spread > 0 && entry.favoriteTeamId) {
        spreads.push({ gameId, spread, favoriteTeamId: entry.favoriteTeamId });
      }
    }
    if (spreads.length === 0) {
      toast({ variant: "destructive", title: "No valid spreads", description: "Enter a spread value > 0 for at least one game." });
      return;
    }
    setLoadingSave(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/pickem/ats-spreads`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ spreads }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to save spreads");
      }
      const data = await res.json();
      toast({ title: "Spreads saved!", description: `${data.saved} line${data.saved !== 1 ? "s" : ""} saved.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setLoadingSave(false);
    }
  }

  if (loadingFetch) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading current spreads…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden">
      <div className="px-5 pt-4 pb-2 border-b border-orange-500/20">
        <h4 className="font-bebas text-xl tracking-wide text-orange-300 flex items-center gap-2">
          Set Spread Lines
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter the spread and favourite for each weekend game. Players must enter
          before the first game locks.
        </p>
      </div>

      <div className="divide-y divide-border/30">
        {games.map((game) => {
          const entry = entries[game.id];
          if (!entry) return null;
          const awayIsFav = entry.favoriteTeamId === game.awayTeam.id;
          const homeIsFav = entry.favoriteTeamId === game.homeTeam.id;
          return (
            <div key={game.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Game label */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {new Date(game.startTime).toLocaleString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
                  })} ET
                </p>
              </div>

              {/* Spread input */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  placeholder="e.g. 6.5"
                  value={entry.spread}
                  onChange={(e) => updateEntry(game.id, { spread: e.target.value })}
                  className="w-24 h-9 text-sm bg-background/50"
                  disabled={game.deadlinePassed}
                />
              </div>

              {/* Favourite selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground/60 mr-1 shrink-0">Fav:</span>
                <button
                  type="button"
                  disabled={game.deadlinePassed}
                  onClick={() => updateEntry(game.id, { favoriteTeamId: game.awayTeam.id })}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                    awayIsFav
                      ? "border-orange-500/60 bg-orange-500/20 text-orange-300"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                    game.deadlinePassed && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {game.awayTeam.abbreviation}
                </button>
                <button
                  type="button"
                  disabled={game.deadlinePassed}
                  onClick={() => updateEntry(game.id, { favoriteTeamId: game.homeTeam.id })}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                    homeIsFav
                      ? "border-orange-500/60 bg-orange-500/20 text-orange-300"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                    game.deadlinePassed && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {game.homeTeam.abbreviation}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-4 border-t border-orange-500/20">
        <Button
          onClick={handleSave}
          disabled={loadingSave || games.every((g) => g.deadlinePassed)}
          className="font-bebas text-lg tracking-wider bg-orange-600 hover:bg-orange-500 text-white border-0"
        >
          {loadingSave ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Spread Lines</>
          )}
        </Button>
        {games.every((g) => g.deadlinePassed) && (
          <p className="text-xs text-muted-foreground/60 mt-2">All games have started — lines are locked.</p>
        )}
      </div>
    </div>
  );
}
