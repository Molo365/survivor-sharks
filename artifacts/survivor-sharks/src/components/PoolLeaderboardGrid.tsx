import { Fragment, ReactNode, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Users, X, Info } from "lucide-react";

// ── Base player shape every consumer must satisfy ──────────────────────────

export interface LeaderboardPlayer {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
}

// ── Cell descriptor returned by renderWeekCell ────────────────────────────

export interface WeekCellDescriptor {
  content: ReactNode;
  tooltip: string;
  clickable: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface PoolLeaderboardGridProps<TPlayer extends LeaderboardPlayer> {
  players: TPlayer[];
  weekColumns: number[];
  currentUserId: number | null;
  hintKey: string;
  isLoading: boolean;
  emptyMessage?: string;
  emptySubtext?: string;
  renderWeekCell: (player: TPlayer, week: number) => WeekCellDescriptor;
  renderTotal: (player: TPlayer) => ReactNode;
  renderExpandPanel: (
    player: TPlayer,
    week: number,
    onClose: () => void,
  ) => ReactNode;
  onCellSelect: (cell: { userId: number; week: number } | null) => void;
  footer?: ReactNode;
  footnote?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="text-yellow-400 font-bebas text-base sm:text-xl leading-none">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="text-slate-300 font-bebas text-base sm:text-xl leading-none">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="text-amber-600 font-bebas text-base sm:text-xl leading-none">
        🥉
      </span>
    );
  return (
    <span className="font-bebas text-sm sm:text-lg text-muted-foreground/60">{rank}</span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function PoolLeaderboardGrid<TPlayer extends LeaderboardPlayer>({
  players,
  weekColumns,
  currentUserId,
  hintKey,
  isLoading,
  emptyMessage = "No Picks Yet",
  emptySubtext = "Nobody has submitted graded picks this season.",
  renderWeekCell,
  renderTotal,
  renderExpandPanel,
  onCellSelect,
  footer,
  footnote,
}: PoolLeaderboardGridProps<TPlayer>) {
  const [showHint, setShowHint] = useState<boolean>(() => {
    try {
      return localStorage.getItem(hintKey) !== "1";
    } catch {
      return true;
    }
  });

  const [selectedCell, setSelectedCell] = useState<{
    userId: number;
    week: number;
  } | null>(null);

  function handleCellClick(userId: number, week: number) {
    const next =
      selectedCell?.userId === userId && selectedCell?.week === week
        ? null
        : { userId, week };
    setSelectedCell(next);
    onCellSelect(next);
  }

  function handleClose() {
    setSelectedCell(null);
    onCellSelect(null);
  }

  const colSpan = weekColumns.length + 3;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-bebas text-2xl tracking-wide mb-1">{emptyMessage}</p>
        <p className="text-sm">{emptySubtext}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Hint banner ───────────────────────────────────────────────── */}
      {showHint && (
        <div className="relative flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 pr-10">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200/80">
            Click any week&apos;s result to see that player&apos;s picks for
            that week.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(hintKey, "1");
              } catch {
                /* ignore */
              }
              setShowHint(false);
            }}
            className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Dismiss hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Leaderboard table ─────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card z-10 w-8 px-1 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center">
                #
              </th>
              <th className="sticky left-8 bg-card z-10 w-24 sm:w-44 px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-left">
                Player
              </th>
              {weekColumns.map((wk) => (
                <th
                  key={wk}
                  className="w-11 px-0.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center"
                >
                  W{wk}
                </th>
              ))}
              <th className="w-16 px-1 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-right pr-2">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {players.map((player) => {
              const isMe = player.userId === currentUserId;
              const isExpanded = selectedCell?.userId === player.userId;
              const rowBg = isMe
                ? "bg-purple-500/5"
                : player.rank === 1
                  ? "bg-yellow-500/5"
                  : "";

              return (
                <Fragment key={player.userId}>
                  {/* ── Player row ── */}
                  <tr className={cn("border-b border-border/20", rowBg)}>
                    {/* Rank — sticky with blended bg */}
                    <td
                      className={cn(
                        "sticky left-0 z-10 px-1 py-1.5 sm:py-2.5 text-center",
                        isMe
                          ? "bg-[color-mix(in_srgb,var(--color-card)_95%,rgba(168,85,247,0.15)_5%)]"
                          : player.rank === 1
                            ? "bg-[color-mix(in_srgb,var(--color-card)_95%,rgba(234,179,8,0.1)_5%)]"
                            : "bg-card",
                      )}
                    >
                      <RankBadge rank={player.rank} />
                    </td>

                    {/* Player name — sticky at left-8 (= rank col width) so rank+name scroll together */}
                    <td
                      className={cn(
                        "sticky left-8 z-10 px-2 py-1.5 sm:py-2.5",
                        isMe
                          ? "bg-[color-mix(in_srgb,var(--color-card)_95%,rgba(168,85,247,0.15)_5%)]"
                          : player.rank === 1
                            ? "bg-[color-mix(in_srgb,var(--color-card)_95%,rgba(234,179,8,0.1)_5%)]"
                            : "bg-card",
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-semibold truncate",
                            isMe ? "text-purple-300" : "text-foreground",
                          )}
                        >
                          {player.displayName ?? player.username}
                        </span>
                        {isMe && (
                          <span className="shrink-0 text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Week cells */}
                    {weekColumns.map((wk) => {
                      const cell = renderWeekCell(player, wk);
                      const isCellActive =
                        isExpanded && selectedCell?.week === wk;

                      return (
                        <td
                          key={wk}
                          onClick={
                            cell.clickable
                              ? () => handleCellClick(player.userId, wk)
                              : undefined
                          }
                          title={cell.tooltip}
                          className={cn(
                            "px-0.5 py-1.5 sm:py-2.5 text-center select-none transition-colors rounded-sm",
                            cell.clickable ? "cursor-pointer" : "cursor-default",
                            isCellActive
                              ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
                              : cell.clickable
                                ? "hover:bg-muted/40"
                                : "",
                          )}
                        >
                          {cell.content}
                        </td>
                      );
                    })}

                    {/* Total */}
                    <td className="pr-2 py-1.5 sm:py-2.5 text-right">
                      {renderTotal(player)}
                    </td>
                  </tr>

                  {/* ── Expand row ── */}
                  {isExpanded && (
                    <tr className="bg-muted/[0.04]">
                      <td
                        colSpan={colSpan}
                        className="px-4 py-4 border-b border-border/30"
                      >
                        {renderExpandPanel(
                          player,
                          selectedCell!.week,
                          handleClose,
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer (tiebreaker card, etc.) ───────────────────────────── */}
      {footer}

      {/* ── Footnote ─────────────────────────────────────────────────── */}
      {footnote && (
        <p className="text-[11px] text-muted-foreground/40 text-center">
          {footnote}
        </p>
      )}
    </div>
  );
}
