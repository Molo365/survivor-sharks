import { Trophy } from "lucide-react";
import type { PickEmLeaderboardEntry } from "@workspace/api-client-react";
import { MemberNameButton } from "@/components/PoolMemberIdentity";
import { cn } from "@/lib/utils";

type Props = {
  entries: PickEmLeaderboardEntry[];
  currentUserId?: number;
  /** When the API served pool-wide totals (ended MLS / Super League). */
  cumulativeStandings?: boolean;
};

export function WeeklyPickEmPoolClosedPanel({ entries, currentUserId, cumulativeStandings }: Props) {
  const totalPicksGraded = entries.reduce((sum, e) => sum + e.picked, 0);
  const hasMeaningfulStandings = totalPicksGraded > 0;
  const topCorrect = entries[0]?.correct ?? 0;
  const winners = hasMeaningfulStandings
    ? entries.filter((e) => e.correct === topCorrect)
    : [];
  const winnerLabel =
    winners.length > 1 ? "Co-Winners" : winners.length === 1 ? "Winner" : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
        <Trophy className="w-16 h-16 text-yellow-500/60 mb-4" />
        <h3 className="font-bebas text-3xl tracking-widest mb-2 text-muted-foreground/70">POOL ENDED</h3>
        <p className="text-muted-foreground">Results are final.</p>
        {cumulativeStandings && hasMeaningfulStandings && (
          <p className="text-xs text-muted-foreground/55 mt-2 max-w-sm">
            Standings below are combined across every period this pool played.
          </p>
        )}
      </div>

      {!hasMeaningfulStandings ? (
        <div className="rounded-xl border border-border/40 bg-muted/15 px-5 py-4 text-sm text-muted-foreground text-center">
          This pool closed before any picks were graded, so there is no final leaderboard to show.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
            <p className="text-yellow-400/80 font-bebas text-lg tracking-wider mb-2 uppercase">{winnerLabel}</p>
            {winners.map((w) => (
              <div key={w.userId} className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">🏆</span>
                <MemberNameButton
                  userId={w.userId}
                  sheetExtras={{ subtitle: `${w.correct}/${w.picked} correct` }}
                  className="font-semibold text-foreground text-lg inline"
                >
                  {w.displayName || w.username}
                </MemberNameButton>
                {w.userId === currentUserId && (
                  <span className="text-xs text-primary/60 font-medium">(you)</span>
                )}
                <span className="text-muted-foreground text-sm">
                  — {w.correct}/{w.picked} correct
                  {cumulativeStandings ? " (all periods)" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            {entries.map((entry, idx) => {
              const isMe = entry.userId === currentUserId;
              return (
                <div
                  key={entry.userId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0",
                    isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "font-bebas text-xl w-7 shrink-0 text-center",
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
                  <span className={cn("flex-1 font-medium truncate min-w-0", isMe ? "text-primary" : "text-foreground")}>
                    <MemberNameButton
                      userId={entry.userId}
                      sheetExtras={{ rank: idx + 1, subtitle: `${entry.correct}/${entry.picked} correct` }}
                      className={cn("inline truncate max-w-full", isMe ? "text-primary" : "text-foreground")}
                      asChildWrapper
                    >
                      {entry.displayName || entry.username}
                    </MemberNameButton>
                    {isMe && (
                      <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-bebas text-2xl text-green-400">{entry.correct}</span>
                    <span className="font-bebas text-xl text-muted-foreground/40">/{entry.picked}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}