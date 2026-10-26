import { useCallback, useMemo, useRef } from "react";
import type { PickEmLeaderboardEntry } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { ChevronRight, Crosshair, LayoutGrid, Loader2 } from "lucide-react";
import {
  formatPickEmLiveGameStatusLabel,
  resolvePickEmLivePickCell,
  type PickEmLiveCellState,
  type PickEmLiveGame,
  type PickEmLiveScoringMode,
} from "@/lib/pickEmLivePickCell";
import { formatSecondsAgo } from "@/lib/nflPickEmLivePickCell";

const GAME_COL_MIN = 52;
const STICKY_PLAYER_W = 108;

type Accent = "nhl" | "default";

const ACCENT_STYLES: Record<
  Accent,
  {
    border: string;
    pulse: string;
    liveText: string;
    jumpBtn: string;
    rowMe: string;
    stickyBg: string;
    meRowBg: string;
    headerLine: string;
  }
> = {
  nhl: {
    border: "border-sky-500/25",
    pulse: "bg-sky-400",
    liveText: "text-sky-300",
    jumpBtn:
      "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
    rowMe: "bg-sky-500/[0.08]",
    stickyBg: "bg-[#0c1014]",
    meRowBg: "bg-[#0e1418]",
    headerLine: "via-sky-400/70",
  },
  default: {
    border: "border-emerald-500/20",
    pulse: "bg-emerald-400",
    liveText: "text-emerald-300",
    jumpBtn:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    rowMe: "bg-emerald-500/[0.08]",
    stickyBg: "bg-[#0c1210]",
    meRowBg: "bg-[#0e1613]",
    headerLine: "via-emerald-400/70",
  },
};

function PickCell({ state, abbr }: { state: PickEmLiveCellState; abbr: string | null }) {
  if (state === "hidden" || !abbr) {
    return <span className="text-white/15 text-xs font-mono">—</span>;
  }

  const styles: Record<Exclude<PickEmLiveCellState, "hidden">, string> = {
    correct: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
    incorrect: "border-red-400/45 bg-red-500/15 text-red-200",
    push: "border-white/20 bg-white/[0.06] text-white/60",
    live_winning:
      "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30",
    live_losing:
      "border-red-400/35 bg-red-500/10 text-red-300/90 ring-1 ring-red-400/20",
    pending: "border-white/15 bg-white/[0.04] text-white/80",
  };

  return (
    <span
      className={cn(
        "inline-flex min-w-[40px] items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] font-bold tracking-tight border",
        styles[state],
      )}
    >
      {abbr}
    </span>
  );
}

function GameHeader({ game, accent }: { game: PickEmLiveGame; accent: Accent }) {
  const a = ACCENT_STYLES[accent];
  const live =
    game.status === "in_progress" ||
    game.status?.toUpperCase() === "STATUS_IN_PROGRESS";
  const final = game.status === "final";
  const score =
    game.awayScore != null && game.homeScore != null
      ? `${game.awayScore}–${game.homeScore}`
      : "—";

  return (
    <div className={cn("flex flex-col items-center gap-0.5 py-1.5 px-0.5 min-w-[52px]", live && "relative")}>
      {live && (
        <span
          className={cn(
            "absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
            accent === "nhl" ? "via-sky-400/70" : "via-emerald-400/70",
          )}
        />
      )}
      <div className="text-[9px] font-semibold text-white/45 whitespace-nowrap leading-tight">
        <span>{game.awayTeam.abbreviation}</span>
        <span className="text-white/25 mx-0.5">@</span>
        <span>{game.homeTeam.abbreviation}</span>
      </div>
      <span
        className={cn(
          "font-mono text-[11px] font-bold tabular-nums leading-none",
          live ? a.liveText : final ? "text-white/90" : "text-white/35",
        )}
      >
        {score}
      </span>
      <span
        className={cn(
          "text-[8px] font-bold uppercase tracking-wider leading-none max-w-[52px] truncate",
          live ? "text-sky-400/90" : final ? "text-white/30" : "text-white/40",
        )}
      >
        {formatPickEmLiveGameStatusLabel(game)}
      </span>
    </div>
  );
}

export type PickEmLiveBoardProps = {
  periodLabel: string;
  games: PickEmLiveGame[];
  entries: PickEmLeaderboardEntry[];
  currentUserId: number | null;
  accent?: Accent;
  scoringMode?: PickEmLiveScoringMode;
  /** Hint under the header (e.g. full slate vs picked games only). */
  gamesScopeLabel?: string;
  isLoading?: boolean;
  dataUpdatedAt?: number;
  isFetching?: boolean;
};

export function PickEmLiveBoard({
  periodLabel,
  games,
  entries,
  currentUserId,
  accent = "default",
  scoringMode = "straight",
  gamesScopeLabel = "Full slate",
  isLoading = false,
  dataUpdatedAt = Date.now(),
  isFetching = false,
}: PickEmLiveBoardProps) {
  const a = ACCENT_STYLES[accent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const sortedGames = useMemo(() => {
    return [...games].sort(
      (x, y) => new Date(x.startTime).getTime() - new Date(y.startTime).getTime(),
    );
  }, [games]);

  const liveCount = sortedGames.filter(
    (g) =>
      g.status === "in_progress" ||
      g.status?.toUpperCase() === "STATUS_IN_PROGRESS",
  ).length;

  const me = entries.find((e) => e.userId === currentUserId);

  const jumpToMe = useCallback(() => {
    if (currentUserId == null) return;
    rowRefs.current.get(currentUserId)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [currentUserId]);

  if (isLoading && entries.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-20 rounded-xl border bg-[#070a09] text-white/50",
          a.border,
        )}
      >
        <Loader2 className={cn("w-8 h-8 animate-spin", a.liveText)} />
        <p className="font-bebas text-lg tracking-wide">Loading live board…</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide">No picks yet</p>
      </div>
    );
  }

  if (sortedGames.length === 0) {
    return (
      <div
        className={cn(
          "text-center py-16 rounded-xl border bg-[#070a09] text-white/50",
          a.border,
        )}
      >
        <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-bebas text-xl tracking-wide">No games this period</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative -mx-3 sm:-mx-0 rounded-none sm:rounded-xl overflow-hidden border bg-[#070a09] text-white",
        a.border,
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5",
          "border-b border-white/10 bg-[#0a0e12]/95 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {liveCount > 0 ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
                  a.pulse,
                )}
              />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", a.pulse)} />
            </span>
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/25" />
          )}
          <span className={cn("font-bebas text-lg tracking-wide leading-none", a.liveText)}>
            Live
          </span>
          <span className="text-white/35 text-xs">·</span>
          <span className="font-bebas text-lg tracking-wide leading-none">{periodLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50 ml-auto">
          {liveCount > 0 && (
            <>
              <span className="font-mono tabular-nums">{liveCount} live</span>
              <span className="text-white/25">·</span>
            </>
          )}
          <span className="font-mono tabular-nums">
            Updated {formatSecondsAgo(dataUpdatedAt)}
            {isFetching ? " · …" : ""}
          </span>
        </div>
        {me && (
          <p className="w-full text-[10px] text-white/40 leading-snug">
            #{me.rank} · {me.correct}/{me.picked} correct this period
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-[#0c1014]/80">
        <p className="text-[10px] text-white/45">
          {gamesScopeLabel} · scroll games{" "}
          <ChevronRight className="inline w-3 h-3 text-white/30" aria-hidden />
        </p>
        {currentUserId != null && (
          <button
            type="button"
            onClick={jumpToMe}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
              a.jumpBtn,
            )}
          >
            <Crosshair className="w-3 h-3" />
            Jump to me
          </button>
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto overflow-y-visible [scrollbar-width:thin]">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: STICKY_PLAYER_W + sortedGames.length * GAME_COL_MIN + 56 }}
        >
          <thead className={cn("z-20", a.stickyBg)}>
            <tr className="border-b border-white/[0.08]">
              <th
                className={cn("sticky left-0 z-30 text-left align-bottom pb-1 pl-2 pr-1", a.stickyBg)}
                style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Player
                </span>
              </th>
              {sortedGames.map((game) => (
                <th key={game.id} className="align-bottom font-normal">
                  <GameHeader game={game} accent={accent} />
                </th>
              ))}
              <th
                className={cn(
                  "sticky right-0 z-30 text-right align-bottom pb-1 pl-1 pr-2",
                  a.stickyBg,
                )}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  ✓
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const isMe = entry.userId === currentUserId;
              const pickMap = new Map(entry.picks.map((p) => [p.gameId, p]));

              return (
                <tr
                  key={entry.userId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(entry.userId, el);
                  }}
                  className={cn(
                    "border-b border-white/[0.05]",
                    isMe ? a.rowMe : idx % 2 === 1 ? "bg-white/[0.02]" : "",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 py-2 pl-2 pr-1 align-middle",
                      a.stickyBg,
                      isMe && a.meRowBg,
                    )}
                    style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
                  >
                    <div className="flex items-baseline gap-1 min-w-0">
                      <span
                        className={cn(
                          "font-mono text-[10px] font-bold tabular-nums shrink-0 w-4",
                          entry.rank === 1
                            ? "text-amber-300"
                            : entry.rank <= 3
                              ? "text-white/50"
                              : "text-white/30",
                        )}
                      >
                        {entry.rank}
                      </span>
                      <span
                        className={cn(
                          "font-bebas text-sm tracking-wide truncate leading-none",
                          isMe ? a.liveText : "text-white/90",
                        )}
                      >
                        {entry.displayName || entry.username}
                      </span>
                    </div>
                  </td>
                  {sortedGames.map((game) => {
                    const pick = pickMap.get(game.id);
                    const { state, abbr } = resolvePickEmLivePickCell(pick, game, {
                      entryUserId: entry.userId,
                      currentUserId,
                      scoringMode,
                    });
                    return (
                      <td key={game.id} className="py-1.5 px-0.5 text-center align-middle">
                        <PickCell state={state} abbr={abbr} />
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "sticky right-0 z-10 py-2 pl-1 pr-2 text-right align-middle",
                      a.stickyBg,
                      isMe && a.meRowBg,
                    )}
                  >
                    <span className="font-mono text-sm font-bold tabular-nums text-white/90">
                      {entry.correct}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
