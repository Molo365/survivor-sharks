import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Download, Check, X, Camera } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GridGame {
  id: string;
  awayTeam: { id: string; abbreviation: string; name: string; logoUrl: string | null };
  homeTeam: { id: string; abbreviation: string; name: string; logoUrl: string | null };
  startTime: string;
  status: string;
  awayScore: number | null;
  homeScore: number | null;
}

interface GridPick {
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

interface GridPlayer {
  userId: number;
  username: string;
  displayName: string | null;
  picks: Record<string, GridPick>;
}

interface GridResponse {
  week: number;
  games: GridGame[];
  players: GridPlayer[];
}

// ── Auth fetch ────────────────────────────────────────────────────────────────

function authedFetch<T>(url: string): Promise<T> {
  const token = localStorage.getItem("auth_token");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface NflConfidenceSnapshotProps {
  poolId: number;
  currentWeek: number;
  variant: "season" | "weekly";
  poolName?: string;
}

export function NflConfidenceSnapshot({
  poolId,
  currentWeek,
  variant,
  poolName = "Pool",
}: NflConfidenceSnapshotProps) {
  const { user } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);

  const urlBase = variant === "weekly" ? "nfl-confidence-weekly" : "nfl-confidence";
  const accentClass = variant === "weekly" ? "text-cyan-400" : "text-purple-400";

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["nfl-confidence-snapshot", poolId, variant, selectedWeek],
    queryFn: () =>
      authedFetch<GridResponse>(`/api/pools/${poolId}/${urlBase}/grid?week=${selectedWeek}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const games = data?.games ?? [];
  const players = data?.players ?? [];

  const anyGameStarted = games.some(
    (g) => g.status === "in_progress" || g.status === "final",
  );

  const sortedGames = useMemo(
    () => [...games].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [games],
  );

  const enrichedPlayers = useMemo(
    () =>
      players
        .map((p) => {
          const weekPts = Object.values(p.picks).reduce(
            (sum, pick) =>
              sum + (pick.result === "correct" ? (pick.confidencePoints ?? 0) : 0),
            0,
          );
          return { ...p, weekPts };
        })
        .sort((a, b) => b.weekPts - a.weekPts),
    [players],
  );

  const weekOptions = Array.from({ length: Math.max(currentWeek, 1) }, (_, i) => i + 1);

  const minWidth = Math.max(420, 240 + sortedGames.length * 82);

  function downloadCsv() {
    const header = [
      "Player",
      ...sortedGames.map((g) => `${g.awayTeam.abbreviation}@${g.homeTeam.abbreviation}`),
      "Week Pts",
    ];
    const rows = enrichedPlayers.map((p) => {
      const name = p.displayName ?? p.username;
      const cells = sortedGames.map((g) => {
        const pick = p.picks[g.id];
        if (!pick) return "—";
        const pts = pick.confidencePoints != null ? ` (${pick.confidencePoints}pts)` : "";
        const outcome =
          pick.result === "correct" ? " (W)"
          : pick.result === "incorrect" ? " (L)"
          : pick.result === "postponed" ? " (PPD)"
          : "";
        return `${pick.pickedTeamName}${pts}${outcome}`;
      });
      return [name, ...cells, String(p.weekPts)];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${poolName.replace(/\s+/g, "_")}_confidence_snapshot_week${selectedWeek}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bebas text-2xl tracking-wide text-foreground flex items-center gap-2">
            <Camera className={cn("w-5 h-5", accentClass)} />
            Pick Snapshot
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Week {selectedWeek} · {enrichedPlayers.length} player{enrichedPlayers.length !== 1 ? "s" : ""} ·{" "}
            {sortedGames.length} game{sortedGames.length !== 1 ? "s" : ""}
            {anyGameStarted && (
              <span className={cn("ml-2 font-medium", accentClass)}>
                — snapshot taken at kick-off
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(selectedWeek)} onValueChange={(v) => setSelectedWeek(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekOptions.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Week {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {anyGameStarted && enrichedPlayers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              className="font-bebas text-base tracking-wider gap-1.5 h-8"
            >
              <Download className="w-4 h-4" /> Download CSV
            </Button>
          )}
        </div>
      </div>

      {/* Lock guard */}
      {!anyGameStarted ? (
        <div className="rounded-xl border border-border/30 bg-muted/[0.03] py-16 flex flex-col items-center gap-3 text-center">
          <Camera className="w-8 h-8 text-muted-foreground/25" />
          <div>
            <p className="font-bebas text-xl tracking-wide text-muted-foreground/50">
              Picks Hidden Until Kick-Off
            </p>
            <p className="text-sm text-muted-foreground/40 mt-1">
              Snapshot will appear once the first game of Week {selectedWeek} begins.
            </p>
          </div>
        </div>
      ) : enrichedPlayers.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-muted/[0.03] py-12 flex items-center justify-center">
          <p className="text-sm text-muted-foreground/50">No picks recorded for Week {selectedWeek}.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm border-separate border-spacing-0"
                style={{ minWidth: `${minWidth}px` }}
              >
                <thead>
                  <tr className="bg-muted/[0.05]">
                    <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-medium text-muted-foreground/60 text-xs whitespace-nowrap">
                      Player
                    </th>
                    {sortedGames.map((g) => (
                      <th
                        key={g.id}
                        className="px-1 py-2 text-center border-b border-border/30 font-mono text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap"
                        style={{ width: 82 }}
                      >
                        <div>{g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}</div>
                        {g.awayScore != null && g.homeScore != null && (
                          <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                            {g.awayScore}–{g.homeScore}
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right border-b border-border/30 font-bebas text-xs text-muted-foreground/40 whitespace-nowrap">
                      Week Pts
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {enrichedPlayers.map((p, idx) => {
                    const isMe = p.userId === user?.id;
                    return (
                      <tr
                        key={p.userId}
                        className={cn(
                          idx < enrichedPlayers.length - 1 &&
                            "[&>td]:border-b [&>td]:border-white/[0.07]",
                          isMe
                            ? "bg-primary/5"
                            : idx % 2 === 0
                            ? "bg-transparent"
                            : "bg-muted/[0.03]",
                        )}
                      >
                        {/* Sticky player info */}
                        <td
                          className={cn(
                            "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30 bg-card",
                            isMe && "ring-inset ring-1 ring-primary/20",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-bebas text-base w-5 shrink-0",
                                idx === 0
                                  ? "text-yellow-400"
                                  : idx === 1
                                  ? "text-zinc-300"
                                  : idx === 2
                                  ? "text-amber-600"
                                  : "text-muted-foreground/40",
                              )}
                            >
                              {idx + 1}
                            </span>
                            <span
                              className={cn(
                                "font-medium text-sm truncate max-w-[120px]",
                                isMe ? "text-primary" : "text-foreground",
                              )}
                            >
                              {p.displayName ?? p.username}
                              {isMe && (
                                <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                                  you
                                </span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Per-game cells */}
                        {sortedGames.map((g) => {
                          const pick = p.picks[g.id];
                          if (!pick) {
                            return (
                              <td key={g.id} className="px-1 py-2 text-center">
                                <span className="text-muted-foreground/20 text-xs">—</span>
                              </td>
                            );
                          }
                          const isAway = pick.pickedTeamId === g.awayTeam.id;
                          const team = isAway ? g.awayTeam : g.homeTeam;
                          const logoUrl = pick.pickedTeamLogoUrl ?? team.logoUrl;

                          return (
                            <td key={g.id} className="px-1 py-2 text-center">
                              <div
                                className={cn(
                                  "inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 border text-center min-w-[60px]",
                                  pick.result === "correct"
                                    ? "border-green-500/40 bg-green-500/10"
                                    : pick.result === "incorrect"
                                    ? "border-red-500/40 bg-red-500/10"
                                    : pick.result === "postponed"
                                    ? "border-yellow-500/40 bg-yellow-500/10"
                                    : "border-border/30 bg-muted/10",
                                )}
                              >
                                {logoUrl && (
                                  <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                                    <img
                                      src={logoUrl}
                                      alt={team.abbreviation}
                                      className="w-4 h-4 object-contain"
                                    />
                                  </div>
                                )}
                                <span
                                  className={cn(
                                    "font-bebas text-[11px] tracking-wide leading-none",
                                    pick.result === "correct"
                                      ? "text-green-400"
                                      : pick.result === "incorrect"
                                      ? "text-red-400"
                                      : pick.result === "postponed"
                                      ? "text-yellow-400"
                                      : "text-muted-foreground/70",
                                  )}
                                >
                                  {team.abbreviation}
                                </span>
                                {/* Confidence points */}
                                {pick.confidencePoints != null && (
                                  <span
                                    className={cn(
                                      "text-[9px] font-bold leading-none",
                                      pick.result === "correct"
                                        ? "text-green-400/70"
                                        : pick.result === "incorrect"
                                        ? "text-red-400/70"
                                        : "text-muted-foreground/50",
                                    )}
                                  >
                                    {pick.confidencePoints}pts
                                  </span>
                                )}
                                {pick.result === "correct" && (
                                  <Check className="w-2.5 h-2.5 text-green-400" />
                                )}
                                {pick.result === "incorrect" && (
                                  <X className="w-2.5 h-2.5 text-red-400" />
                                )}
                                {pick.result === "postponed" && (
                                  <span className="text-[8px] font-bold tracking-widest text-yellow-400 leading-none">
                                    PPD
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Week total */}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <span className={cn("font-bebas text-xl", accentClass)}>
                            {p.weekPts}
                          </span>
                          <span className="font-bebas text-sm text-muted-foreground/40 ml-1">
                            pts
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/40 text-center">
            Frozen at kick-off · Confidence points shown per pick · Scroll right to see all games ·
            Results update automatically
          </p>
        </>
      )}
    </div>
  );
}
