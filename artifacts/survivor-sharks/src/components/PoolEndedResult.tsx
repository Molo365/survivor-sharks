import { useGetFinalResults } from "@workspace/api-client-react";
import { Trophy, Loader2 } from "lucide-react";
import { ORDINALS } from "@/lib/calculatePayouts";

interface Props {
  poolId: number;
}

function medalEmoji(pos: number): string {
  if (pos === 1) return "🏆";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return "";
}

function coWinnerPositionText(count: number): string {
  const slots = Array.from({ length: count }, (_, i) => ORDINALS[i] ?? `${i + 1}th`);
  if (slots.length <= 1) return "";
  const last = slots[slots.length - 1];
  const rest = slots.slice(0, -1).join(", ");
  return `Co-winners split ${rest} & ${last} place`;
}

export function PoolEndedResult({ poolId }: Props) {
  const { data, isLoading } = useGetFinalResults(poolId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/50 rounded-lg bg-card/30 mb-6">
        <Trophy className="w-14 h-14 text-yellow-500/60 mb-4" />
        <h3 className="font-bebas text-3xl tracking-widest mb-3 text-muted-foreground/70">POOL ENDED</h3>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const { currentUserEntry: entry, payouts, isFreePool, hadTiebreaker } = data;

  let personalSection: React.ReactNode = null;

  if (entry) {
    const { finishPosition: pos, prizeAmount, finalWinner, coWinners } = entry;
    const hasPrize = prizeAmount != null && prizeAmount > 0;
    const isCoWinner = finalWinner && coWinners > 1;

    if (finalWinner && isFreePool) {
      personalSection = (
        <div className="text-center">
          <p className="font-bebas text-4xl md:text-5xl tracking-widest text-yellow-400">🏆 YOU WON!</p>
        </div>
      );
    } else if (finalWinner && hasPrize && isCoWinner) {
      personalSection = (
        <div className="text-center space-y-1">
          <p className="font-bebas text-4xl md:text-5xl tracking-widest text-yellow-400">
            🏆 YOU WON — ${prizeAmount!.toLocaleString()}{" "}
            <span className="text-2xl text-yellow-400/70">(split)</span>
          </p>
          <p className="text-sm text-muted-foreground">{coWinnerPositionText(coWinners)}</p>
          {hadTiebreaker && <p className="text-xs text-muted-foreground/70">Won via tiebreaker</p>}
        </div>
      );
    } else if (finalWinner && hasPrize) {
      personalSection = (
        <div className="text-center space-y-1">
          <p className="font-bebas text-4xl md:text-5xl tracking-widest text-yellow-400">
            🏆 YOU WON — ${prizeAmount!.toLocaleString()}
          </p>
          {hadTiebreaker && <p className="text-sm text-muted-foreground">Won via tiebreaker</p>}
        </div>
      );
    } else if (pos != null && pos > 1 && hasPrize) {
      const emoji = medalEmoji(pos);
      const ordinal = ORDINALS[pos - 1] ?? `${pos}th`;
      personalSection = (
        <div className="text-center">
          <p className="font-bebas text-3xl md:text-4xl tracking-widest text-foreground/80">
            {emoji} You finished {ordinal} — ${prizeAmount!.toLocaleString()}
          </p>
        </div>
      );
    } else if (pos != null) {
      const ordinal = ORDINALS[pos - 1] ?? `${pos}th`;
      personalSection = (
        <div className="text-center">
          <p className="font-bebas text-2xl tracking-widest text-muted-foreground">
            You finished {ordinal} — Better luck next time!
          </p>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col items-center py-10 text-center border border-dashed border-border/50 rounded-lg bg-card/30 mb-6 gap-6">
      <div className="space-y-2">
        <Trophy className="w-14 h-14 text-yellow-500/60 mx-auto" />
        <h3 className="font-bebas text-3xl tracking-widest text-muted-foreground/70">POOL ENDED</h3>
      </div>

      {personalSection}

      {payouts.length > 0 && (
        <div className="w-full max-w-xs mx-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground/60 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-3">Position</th>
                <th className="text-left py-2 px-3">Player</th>
                {!isFreePool && <th className="text-right py-2 px-3">Prize</th>}
              </tr>
            </thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={`${p.userId}-${i}`} className="border-b border-border/20 last:border-0">
                  <td className="py-2 px-3 font-medium whitespace-nowrap">
                    {medalEmoji(p.finishPosition)}{" "}
                    {ORDINALS[p.finishPosition - 1] ?? `${p.finishPosition}th`}
                  </td>
                  <td className="py-2 px-3 text-left">{p.username}</td>
                  {!isFreePool && (
                    <td className="py-2 px-3 text-right font-medium text-green-400">
                      {p.prizeAmount != null ? `$${p.prizeAmount.toLocaleString()}` : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
