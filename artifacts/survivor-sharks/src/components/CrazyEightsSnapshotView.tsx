import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadGridPdf } from "@/lib/downloadGridPdf";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotTeam {
  id: string;
  abbreviation: string;
  name: string;
  logoUrl: string | null;
}

interface SnapshotGame {
  id: string;
  startTime: string;
  status: string;
  awayTeam: SnapshotTeam;
  homeTeam: SnapshotTeam;
  awayScore: number | null;
  homeScore: number | null;
}

interface SnapshotPick {
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamLogoUrl: string | null;
  confidencePoints: number | null;
  result: string | null;
}

interface SnapshotPlayer {
  userId: number;
  username: string;
  displayName: string | null;
  picks: Record<string, SnapshotPick>;
}

interface GridResponse {
  date: string;
  dateLabel: string;
  games: SnapshotGame[];
  players: SnapshotPlayer[];
}

export interface CrazyEightsSnapshotViewProps {
  poolId: number;
  currentUserId: number | null;
  poolName: string;
  sport: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedFetch<T>(url: string): Promise<T> {
  return fetch(url, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

function formatTimeEt(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        hour12: true,
      }) + " ET"
    );
  } catch {
    return "";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CrazyEightsSnapshotView({
  poolId,
  currentUserId,
  poolName,
  sport,
}: CrazyEightsSnapshotViewProps) {
  const todayEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["crazy-eights-grid", poolId, todayEt],
    queryFn: () =>
      authedFetch<GridResponse>(
        `/api/pools/${poolId}/crazy-eights/grid?date=${todayEt}`,
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const sortedPlayers = useMemo(() => {
    if (!data?.players) return [];
    return [...data.players]
      .map((p) => ({
        ...p,
        weeklyPoints: Object.values(p.picks).reduce(
          (sum, pk) => sum + (pk.result === "correct" ? (pk.confidencePoints ?? 0) : 0),
          0,
        ),
      }))
      .sort((a, b) => b.weeklyPoints - a.weeklyPoints);
  }, [data?.players]);

  const games = data?.games ?? [];
  const minWidth = Math.max(400, 220 + games.length * 72);

  function handleDownloadPdf() {
    if (!data) return;
    const sportLabel = sport.toUpperCase();
    const gameColHeaders = games.map(
      (g) => `${g.awayTeam.abbreviation}@${g.homeTeam.abbreviation}`,
    );
    const pdfRows = sortedPlayers.map((p, idx) => {
      const name = `${idx + 1}. ${p.displayName ?? p.username}`;
      const pickCells = games.map((g) => {
        const pick = p.picks[g.id];
        if (!pick) return "—";
        const isAway = pick.pickedTeamId === g.awayTeam.id;
        const abbrev = isAway ? g.awayTeam.abbreviation : g.homeTeam.abbreviation;
        const suffix =
          pick.result === "correct"
            ? " W"
            : pick.result === "incorrect"
            ? " L"
            : pick.result === "postponed"
            ? " PPD"
            : "";
        const pts = pick.confidencePoints != null ? ` (${pick.confidencePoints})` : "";
        return `${abbrev}${suffix}${pts}`;
      });
      return {
        cells: [name, ...pickCells, `${p.weeklyPoints}pts`],
        isCurrentUser: p.userId === currentUserId,
      };
    });
    downloadGridPdf({
      filename: `${poolName.replace(/\s+/g, "_")}_snapshot_${data.date}.pdf`,
      poolName,
      sport: sportLabel,
      subtitle: `${sortedPlayers.length} player${sortedPlayers.length !== 1 ? "s" : ""} · ${games.length} game${games.length !== 1 ? "s" : ""} · ${data.dateLabel}`,
      columns: ["Player", ...gameColHeaders, "Pts"],
      rows: pdfRows,
      footer: `Snapshot · ${data.date}`,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bebas text-2xl tracking-wide text-foreground">Pick Snapshot</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data?.dateLabel} · {sortedPlayers.length} player{sortedPlayers.length !== 1 ? "s" : ""} ·{" "}
            {games.length} game{games.length !== 1 ? "s" : ""}
          </p>
        </div>
        {sortedPlayers.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            className="font-bebas text-base tracking-wider gap-1.5 shrink-0"
          >
            <Download className="w-4 h-4" /> Download PDF
          </Button>
        )}
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm border-separate border-spacing-0"
            style={{ minWidth: `${minWidth}px` }}
          >
            <thead>
              <tr className="bg-muted/[0.05]">
                <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2 border-b border-border/30 border-r border-border/20" />
                {games.map((game) => (
                  <th
                    key={game.id}
                    className="px-1 py-2 text-center border-b border-border/30 font-mono text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap"
                    style={{ width: 72 }}
                  >
                    <div>
                      {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                    </div>
                    <div
                      className={cn(
                        "text-[9px] mt-0.5 font-normal",
                        game.status === "final"
                          ? "text-muted-foreground/50"
                          : game.status === "in_progress"
                          ? "text-green-400/80"
                          : "text-muted-foreground/40",
                      )}
                    >
                      {game.status === "final"
                        ? `${game.awayScore ?? ""}–${game.homeScore ?? ""} F`
                        : game.status === "in_progress"
                        ? "LIVE"
                        : formatTimeEt(game.startTime)}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right border-b border-border/30 font-bebas text-xs text-muted-foreground/40 whitespace-nowrap">
                  Pts
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedPlayers.length === 0 ? (
                <tr>
                  <td
                    colSpan={games.length + 2}
                    className="text-center py-10 text-sm text-muted-foreground"
                  >
                    No picks submitted yet.
                  </td>
                </tr>
              ) : (
                sortedPlayers.map((player, idx) => {
                  const isMe = player.userId === currentUserId;
                  return (
                    <tr
                      key={player.userId}
                      className={cn(
                        idx < sortedPlayers.length - 1 && "[&>td]:border-b-2 [&>td]:border-white/20",
                        isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                      )}
                    >
                      {/* Sticky player column */}
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
                              "font-medium text-sm truncate max-w-[110px]",
                              isMe ? "text-primary" : "text-foreground",
                            )}
                          >
                            {player.displayName ?? player.username}
                            {isMe && (
                              <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                                you
                              </span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Per-game pick cells */}
                      {games.map((game) => {
                        const pick = player.picks[game.id];
                        if (!pick) {
                          return (
                            <td key={game.id} className="px-1 py-2 text-center">
                              <span className="text-muted-foreground/20 text-xs">—</span>
                            </td>
                          );
                        }
                        const isAway = pick.pickedTeamId === game.awayTeam.id;
                        const team = isAway ? game.awayTeam : game.homeTeam;
                        return (
                          <td key={game.id} className="px-1 py-2 text-center">
                            <div
                              className={cn(
                                "inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 border text-center min-w-[52px]",
                                pick.result === "correct"
                                  ? "border-green-500/40 bg-green-500/10"
                                  : pick.result === "incorrect"
                                  ? "border-red-500/40 bg-red-500/10"
                                  : pick.result === "postponed"
                                  ? "border-yellow-500/40 bg-yellow-500/10"
                                  : "border-border/30 bg-muted/10",
                              )}
                            >
                              {team.logoUrl && (
                                <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                                  <img
                                    src={team.logoUrl}
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
                              {pick.confidencePoints != null && (
                                <span className="text-[8px] font-mono text-muted-foreground/50 leading-none">
                                  {pick.confidencePoints}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Weekly points */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-bebas text-lg text-green-400">
                          {player.weeklyPoints}
                        </span>
                        <span className="font-bebas text-xs text-muted-foreground/40 ml-0.5">
                          pts
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/50 text-center">Results update automatically</p>
    </div>
  );
}
