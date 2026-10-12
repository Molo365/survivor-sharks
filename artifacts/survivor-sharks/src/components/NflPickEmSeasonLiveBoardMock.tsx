import { useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Crosshair } from "lucide-react";

type GameStatus = "scheduled" | "in_progress" | "final";
type PickResult = "pending" | "correct" | "incorrect" | "live_winning" | "live_losing";

type MockGame = {
  id: string;
  awayAbbr: string;
  homeAbbr: string;
  awayScore: number | null;
  homeScore: number | null;
  status: GameStatus;
  statusLabel: string;
  winningTeamId: string | null;
};

type MockPick = {
  gameId: string;
  teamAbbr: string;
  teamId: string;
  result: PickResult;
};

type MockPlayer = {
  userId: number;
  rank: number;
  name: string;
  weekPts: number;
  weekLiveDelta: number;
  seasonRank: number;
  seasonPts: number;
  picks: MockPick[];
};

const MOCK_GAMES: MockGame[] = [
  { id: "g1", awayAbbr: "DAL", homeAbbr: "DET", awayScore: 27, homeScore: 31, status: "final", statusLabel: "FINAL", winningTeamId: "DET" },
  { id: "g2", awayAbbr: "SEA", homeAbbr: "ATL", awayScore: 17, homeScore: 14, status: "final", statusLabel: "FINAL", winningTeamId: "SEA" },
  { id: "g3", awayAbbr: "TEN", homeAbbr: "HOU", awayScore: 10, homeScore: 24, status: "final", statusLabel: "FINAL", winningTeamId: "HOU" },
  { id: "g4", awayAbbr: "NE", homeAbbr: "IND", awayScore: 21, homeScore: 20, status: "final", statusLabel: "FINAL", winningTeamId: "NE" },
  { id: "g5", awayAbbr: "MIN", homeAbbr: "GB", awayScore: 24, homeScore: 21, status: "in_progress", statusLabel: "Q4 4:12", winningTeamId: "MIN" },
  { id: "g6", awayAbbr: "DEN", homeAbbr: "LV", awayScore: 14, homeScore: 17, status: "in_progress", statusLabel: "Q3 8:41", winningTeamId: "LV" },
  { id: "g7", awayAbbr: "PHI", homeAbbr: "NYG", awayScore: 17, homeScore: 10, status: "in_progress", statusLabel: "Q3 2:05", winningTeamId: "PHI" },
  { id: "g8", awayAbbr: "CLE", homeAbbr: "PIT", awayScore: 7, homeScore: 13, status: "in_progress", statusLabel: "Q2 0:38", winningTeamId: "PIT" },
  { id: "g9", awayAbbr: "LAR", homeAbbr: "ARI", awayScore: null, homeScore: null, status: "scheduled", statusLabel: "4:25p", winningTeamId: null },
  { id: "g10", awayAbbr: "BUF", homeAbbr: "KC", awayScore: null, homeScore: null, status: "scheduled", statusLabel: "4:25p", winningTeamId: null },
  { id: "g11", awayAbbr: "CIN", homeAbbr: "BAL", awayScore: null, homeScore: null, status: "scheduled", statusLabel: "4:25p", winningTeamId: null },
  { id: "g12", awayAbbr: "SF", homeAbbr: "TB", awayScore: null, homeScore: null, status: "scheduled", statusLabel: "8:20p", winningTeamId: null },
  { id: "g13", awayAbbr: "MIA", homeAbbr: "NYJ", awayScore: null, homeScore: null, status: "scheduled", statusLabel: "1:00p", winningTeamId: null },
  { id: "g14", awayAbbr: "JAX", homeAbbr: "NO", awayScore: null, homeScore: null, status: "scheduled", statusLabel: "1:00p", winningTeamId: null },
];

function buildPicks(
  choices: Array<{ gameId: string; abbr: string; result: PickResult }>,
): MockPick[] {
  return choices.map((c) => ({
    gameId: c.gameId,
    teamAbbr: c.abbr,
    teamId: c.abbr,
    result: c.result,
  }));
}

const MOCK_PLAYERS: MockPlayer[] = [
  {
    userId: 1,
    rank: 1,
    name: "Cheers",
    weekPts: 18,
    weekLiveDelta: 6,
    seasonRank: 1,
    seasonPts: 142,
    picks: buildPicks([
      { gameId: "g1", abbr: "DET", result: "correct" },
      { gameId: "g2", abbr: "SEA", result: "correct" },
      { gameId: "g3", abbr: "HOU", result: "correct" },
      { gameId: "g4", abbr: "NE", result: "correct" },
      { gameId: "g5", abbr: "MIN", result: "live_winning" },
      { gameId: "g6", abbr: "LV", result: "live_winning" },
      { gameId: "g7", abbr: "PHI", result: "live_winning" },
      { gameId: "g8", abbr: "PIT", result: "live_winning" },
      { gameId: "g9", abbr: "LAR", result: "pending" },
      { gameId: "g10", abbr: "BUF", result: "pending" },
      { gameId: "g11", abbr: "BAL", result: "pending" },
      { gameId: "g12", abbr: "SF", result: "pending" },
      { gameId: "g13", abbr: "MIA", result: "pending" },
      { gameId: "g14", abbr: "JAX", result: "pending" },
    ]),
  },
  {
    userId: 2,
    rank: 2,
    name: "Molo",
    weekPts: 16,
    weekLiveDelta: 4,
    seasonRank: 3,
    seasonPts: 128,
    picks: buildPicks([
      { gameId: "g1", abbr: "DET", result: "correct" },
      { gameId: "g2", abbr: "ATL", result: "incorrect" },
      { gameId: "g3", abbr: "HOU", result: "correct" },
      { gameId: "g4", abbr: "IND", result: "incorrect" },
      { gameId: "g5", abbr: "GB", result: "live_losing" },
      { gameId: "g6", abbr: "DEN", result: "live_losing" },
      { gameId: "g7", abbr: "PHI", result: "live_winning" },
      { gameId: "g8", abbr: "CLE", result: "live_losing" },
      { gameId: "g9", abbr: "ARI", result: "pending" },
      { gameId: "g10", abbr: "KC", result: "pending" },
      { gameId: "g11", abbr: "CIN", result: "pending" },
      { gameId: "g12", abbr: "TB", result: "pending" },
      { gameId: "g13", abbr: "NYJ", result: "pending" },
      { gameId: "g14", abbr: "NO", result: "pending" },
    ]),
  },
  {
    userId: 3,
    rank: 3,
    name: "OfficeMike",
    weekPts: 14,
    weekLiveDelta: 2,
    seasonRank: 2,
    seasonPts: 135,
    picks: buildPicks([
      { gameId: "g1", abbr: "DAL", result: "incorrect" },
      { gameId: "g2", abbr: "SEA", result: "correct" },
      { gameId: "g3", abbr: "TEN", result: "incorrect" },
      { gameId: "g4", abbr: "NE", result: "correct" },
      { gameId: "g5", abbr: "MIN", result: "live_winning" },
      { gameId: "g6", abbr: "LV", result: "live_winning" },
      { gameId: "g7", abbr: "NYG", result: "live_losing" },
      { gameId: "g8", abbr: "PIT", result: "live_winning" },
      { gameId: "g9", abbr: "LAR", result: "pending" },
      { gameId: "g10", abbr: "BUF", result: "pending" },
      { gameId: "g11", abbr: "BAL", result: "pending" },
      { gameId: "g12", abbr: "SF", result: "pending" },
      { gameId: "g13", abbr: "MIA", result: "pending" },
      { gameId: "g14", abbr: "JAX", result: "pending" },
    ]),
  },
  {
    userId: 4,
    rank: 4,
    name: "Jen",
    weekPts: 12,
    weekLiveDelta: 0,
    seasonRank: 5,
    seasonPts: 119,
    picks: buildPicks([
      { gameId: "g1", abbr: "DET", result: "correct" },
      { gameId: "g2", abbr: "ATL", result: "incorrect" },
      { gameId: "g3", abbr: "HOU", result: "correct" },
      { gameId: "g4", abbr: "IND", result: "incorrect" },
      { gameId: "g5", abbr: "GB", result: "live_losing" },
      { gameId: "g6", abbr: "LV", result: "live_winning" },
      { gameId: "g7", abbr: "PHI", result: "live_winning" },
      { gameId: "g8", abbr: "PIT", result: "live_winning" },
      { gameId: "g9", abbr: "LAR", result: "pending" },
      { gameId: "g10", abbr: "KC", result: "pending" },
      { gameId: "g11", abbr: "BAL", result: "pending" },
      { gameId: "g12", abbr: "TB", result: "pending" },
      { gameId: "g13", abbr: "NYJ", result: "pending" },
      { gameId: "g14", abbr: "NO", result: "pending" },
    ]),
  },
  {
    userId: 5,
    rank: 5,
    name: "Dave",
    weekPts: 10,
    weekLiveDelta: 0,
    seasonRank: 8,
    seasonPts: 104,
    picks: buildPicks([
      { gameId: "g1", abbr: "DAL", result: "incorrect" },
      { gameId: "g2", abbr: "SEA", result: "correct" },
      { gameId: "g3", abbr: "HOU", result: "correct" },
      { gameId: "g4", abbr: "NE", result: "correct" },
      { gameId: "g5", abbr: "GB", result: "live_losing" },
      { gameId: "g6", abbr: "DEN", result: "live_losing" },
      { gameId: "g7", abbr: "NYG", result: "live_losing" },
      { gameId: "g8", abbr: "CLE", result: "live_losing" },
      { gameId: "g9", abbr: "ARI", result: "pending" },
      { gameId: "g10", abbr: "BUF", result: "pending" },
      { gameId: "g11", abbr: "CIN", result: "pending" },
      { gameId: "g12", abbr: "SF", result: "pending" },
      { gameId: "g13", abbr: "MIA", result: "pending" },
      { gameId: "g14", abbr: "JAX", result: "pending" },
    ]),
  },
  {
    userId: 6,
    rank: 6,
    name: "Kris",
    weekPts: 8,
    weekLiveDelta: 0,
    seasonRank: 4,
    seasonPts: 121,
    picks: buildPicks([
      { gameId: "g1", abbr: "DET", result: "correct" },
      { gameId: "g2", abbr: "SEA", result: "correct" },
      { gameId: "g3", abbr: "TEN", result: "incorrect" },
      { gameId: "g4", abbr: "IND", result: "incorrect" },
      { gameId: "g5", abbr: "MIN", result: "live_winning" },
      { gameId: "g6", abbr: "DEN", result: "live_losing" },
      { gameId: "g7", abbr: "PHI", result: "live_winning" },
      { gameId: "g8", abbr: "PIT", result: "live_winning" },
      { gameId: "g9", abbr: "LAR", result: "pending" },
      { gameId: "g10", abbr: "KC", result: "pending" },
      { gameId: "g11", abbr: "BAL", result: "pending" },
      { gameId: "g12", abbr: "TB", result: "pending" },
      { gameId: "g13", abbr: "NYJ", result: "pending" },
      { gameId: "g14", abbr: "NO", result: "pending" },
    ]),
  },
];

const GAME_COL_MIN = 52;
const STICKY_PLAYER_W = 108;

function PickCell({ pick }: { pick: MockPick | undefined }) {
  if (!pick) {
    return <span className="text-white/15 text-xs font-mono">—</span>;
  }

  const styles: Record<PickResult, string> = {
    correct: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
    incorrect: "border-red-400/45 bg-red-500/15 text-red-200",
    live_winning: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30",
    live_losing: "border-red-400/35 bg-red-500/10 text-red-300/90 ring-1 ring-red-400/20",
    pending: "border-white/15 bg-white/[0.04] text-white/80",
  };

  return (
    <span
      className={cn(
        "inline-flex min-w-[40px] items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] font-bold tracking-tight border",
        styles[pick.result],
      )}
    >
      {pick.teamAbbr}
    </span>
  );
}

function GameHeader({ game }: { game: MockGame }) {
  const live = game.status === "in_progress";
  const final = game.status === "final";
  const score =
    game.awayScore != null && game.homeScore != null
      ? `${game.awayScore}–${game.homeScore}`
      : "—";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 py-1.5 px-0.5 min-w-[52px]",
        live && "relative",
      )}
    >
      {live && (
        <span className="absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
      )}
      <div className="text-[9px] font-semibold text-white/45 whitespace-nowrap leading-tight">
        <span>{game.awayAbbr}</span>
        <span className="text-white/25 mx-0.5">@</span>
        <span>{game.homeAbbr}</span>
      </div>
      <span
        className={cn(
          "font-mono text-[11px] font-bold tabular-nums leading-none",
          live ? "text-emerald-300" : final ? "text-white/90" : "text-white/35",
        )}
      >
        {score}
      </span>
      <span
        className={cn(
          "text-[8px] font-bold uppercase tracking-wider leading-none",
          live ? "text-emerald-400/90" : final ? "text-white/30" : "text-white/40",
        )}
      >
        {game.statusLabel}
      </span>
    </div>
  );
}

export type NflPickEmSeasonLiveBoardMockProps = {
  week?: number;
  currentUserId?: number | null;
};

export function NflPickEmSeasonLiveBoardMock({
  week = 7,
  currentUserId = 2,
}: NflPickEmSeasonLiveBoardMockProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const liveCount = useMemo(
    () => MOCK_GAMES.filter((g) => g.status === "in_progress").length,
    [],
  );

  const jumpToMe = useCallback(() => {
    const id = currentUserId ?? 2;
    const row = rowRefs.current.get(id);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [currentUserId]);

  const stickyBg = "bg-[#0c1210]";

  return (
    <div
      className={cn(
        "relative -mx-3 sm:-mx-0 rounded-none sm:rounded-xl overflow-hidden",
        "border border-emerald-500/20 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.08)]",
        "bg-[#070a09] text-white",
      )}
    >
      {/* Broadcast bar */}
      <div
        className={cn(
          "sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5",
          "border-b border-emerald-500/15 bg-[#0a100e]/95 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-bebas text-lg tracking-wide text-emerald-300 leading-none">Live</span>
          <span className="text-white/35 text-xs">·</span>
          <span className="font-bebas text-lg tracking-wide leading-none">Week {week}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50 ml-auto">
          <span className="font-mono tabular-nums">{liveCount} live</span>
          <span className="text-white/25">·</span>
          <span className="font-mono tabular-nums">Updated 18s ago</span>
          <span
            className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200/90"
          >
            Preview
          </span>
        </div>
        <p className="w-full text-[10px] text-white/40 leading-snug">
          Season · #{MOCK_PLAYERS.find((p) => p.userId === currentUserId)?.seasonRank ?? "—"} ·{" "}
          {MOCK_PLAYERS.find((p) => p.userId === currentUserId)?.seasonPts ?? "—"} pts · static demo data
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-[#0c1210]/80">
        <p className="text-[10px] text-white/45">
          Full week · scroll games{" "}
          <ChevronRight className="inline w-3 h-3 text-white/30" aria-hidden />
        </p>
        <button
          type="button"
          onClick={jumpToMe}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/20 transition-colors"
        >
          <Crosshair className="w-3 h-3" />
          Jump to me
        </button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-visible [scrollbar-width:thin] scrollbar-thumb-white/10"
        style={{
          backgroundImage:
            "linear-gradient(to right, #0c1210 0%, transparent 12px), linear-gradient(to left, #0c1210 0%, transparent 12px)",
        }}
      >
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: STICKY_PLAYER_W + MOCK_GAMES.length * GAME_COL_MIN + 56 }}
        >
          <thead className={cn("sticky top-[theme(spacing.0)] z-20", stickyBg)}>
            <tr className="border-b border-white/[0.08]">
              <th
                className={cn(
                  "sticky left-0 z-30 text-left align-bottom pb-1 pl-2 pr-1",
                  stickyBg,
                )}
                style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Player
                </span>
              </th>
              {MOCK_GAMES.map((game) => (
                <th key={game.id} className="align-bottom font-normal">
                  <GameHeader game={game} />
                </th>
              ))}
              <th
                className={cn(
                  "sticky right-0 z-30 text-right align-bottom pb-1 pl-1 pr-2",
                  stickyBg,
                )}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">
                  Wk
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {MOCK_PLAYERS.map((player, idx) => {
              const isMe = player.userId === currentUserId;
              const pickByGame = new Map(player.picks.map((p) => [p.gameId, p]));

              return (
                <tr
                  key={player.userId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(player.userId, el);
                  }}
                  className={cn(
                    "border-b border-white/[0.05]",
                    isMe ? "bg-emerald-500/[0.08]" : idx % 2 === 1 ? "bg-white/[0.02]" : "",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 py-2 pl-2 pr-1 align-middle",
                      stickyBg,
                      isMe && "bg-[#0e1613]",
                    )}
                    style={{ minWidth: STICKY_PLAYER_W, width: STICKY_PLAYER_W }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-baseline gap-1 min-w-0">
                        <span
                          className={cn(
                            "font-mono text-[10px] font-bold tabular-nums shrink-0 w-4",
                            player.rank === 1
                              ? "text-amber-300"
                              : player.rank <= 3
                                ? "text-white/50"
                                : "text-white/30",
                          )}
                        >
                          {player.rank}
                        </span>
                        <span
                          className={cn(
                            "font-bebas text-sm tracking-wide truncate leading-none",
                            isMe ? "text-emerald-200" : "text-white/90",
                          )}
                        >
                          {player.name}
                        </span>
                      </div>
                      {player.weekLiveDelta > 0 && (
                        <span className="text-[9px] font-mono text-emerald-400/80 pl-5">
                          +{player.weekLiveDelta} live
                        </span>
                      )}
                    </div>
                  </td>
                  {MOCK_GAMES.map((game) => (
                    <td key={game.id} className="py-1.5 px-0.5 text-center align-middle">
                      <PickCell pick={pickByGame.get(game.id)} />
                    </td>
                  ))}
                  <td
                    className={cn(
                      "sticky right-0 z-10 py-2 pl-1 pr-2 text-right align-middle",
                      stickyBg,
                      isMe && "bg-[#0e1613]",
                    )}
                  >
                    <span className="font-mono text-sm font-bold tabular-nums text-white/90">
                      {player.weekPts}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="px-3 py-2.5 text-[9px] text-center text-white/30 border-t border-white/[0.06]">
        Design preview — not connected to your pool yet. Pick visibility and scoring will match Weekly Grid when live.
      </p>
    </div>
  );
}
