import { useState } from "react";
import {
  useGetWcBracketRoundAllPicks,
  getGetWcBracketRoundAllPicksQueryKey,
} from "@workspace/api-client-react";
import type { WcBracketGridMatch, WcBracketGridMember } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, X, Clock, Download } from "lucide-react";
import { downloadGridPdf } from "@/lib/downloadGridPdf";

const ROUND_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarterfinals",
  "semifinals",
  "final",
] as const;

const ROUND_LABEL: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinals: "Quarterfinals",
  semifinals: "Semifinals",
  final: "Final",
};

function formatMatchDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function TeamFlag({
  logo,
  name,
  size = 20,
}: {
  logo: string | null | undefined;
  name: string;
  size?: number;
}) {
  if (!logo) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-muted/30 text-[9px] font-bold text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={logo}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-contain shrink-0"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function PickCell({
  pick,
  match,
}: {
  pick: { pickedTeam: string; isCorrect: boolean | null } | undefined;
  match: WcBracketGridMatch;
}) {
  if (!pick) {
    return (
      <td className="px-2 py-2 text-center border-b border-border/20 border-r border-r-border/10">
        <span className="text-muted-foreground/30 text-sm font-medium">—</span>
      </td>
    );
  }

  const { pickedTeam, isCorrect } = pick;
  const isTeam1 = pickedTeam === match.team1;
  const logo = isTeam1 ? match.team1Logo : match.team2Logo;

  const cellBg =
    isCorrect === true
      ? "bg-green-500/10"
      : isCorrect === false
        ? "bg-red-500/10"
        : "bg-transparent";

  const textColor =
    isCorrect === true
      ? "text-green-400"
      : isCorrect === false
        ? "text-red-400"
        : "text-foreground/80";

  return (
    <td
      className={cn(
        "px-2 py-2 text-center border-b border-border/20 border-r border-r-border/10 transition-colors",
        cellBg,
      )}
    >
      <div className="flex flex-col items-center gap-1 min-w-[56px]">
        <div className="flex items-center gap-1">
          <TeamFlag logo={logo} name={pickedTeam} size={18} />
          {isCorrect === true && (
            <span className="text-green-400 shrink-0">
              <Check className="w-3 h-3" />
            </span>
          )}
          {isCorrect === false && (
            <span className="text-red-400 shrink-0">
              <X className="w-3 h-3" />
            </span>
          )}
          {isCorrect === null && match.isCompleted && (
            <span className="text-muted-foreground/40 shrink-0">
              <Clock className="w-3 h-3" />
            </span>
          )}
        </div>
        <span className={cn("text-[10px] font-semibold leading-tight truncate max-w-[56px]", textColor)}>
          {pickedTeam.length > 8 ? pickedTeam.slice(0, 8) + "…" : pickedTeam}
        </span>
      </div>
    </td>
  );
}

function MatchHeader({ match }: { match: WcBracketGridMatch }) {
  return (
    <th
      className="px-2 py-3 text-center border-b-2 border-border/40 border-r border-r-border/10 min-w-[80px] bg-card sticky top-0 z-10"
      key={match.espnEventId}
    >
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1 justify-center">
          <TeamFlag logo={match.team1Logo} name={match.team1} size={16} />
          <span className="text-[9px] text-muted-foreground/50 font-bold">vs</span>
          <TeamFlag logo={match.team2Logo} name={match.team2} size={16} />
        </div>
        <div className="text-[9px] font-semibold text-foreground/70 leading-tight text-center">
          <span className="block truncate max-w-[70px]">
            {match.team1.length > 6 ? match.team1.slice(0, 6) + "…" : match.team1}
          </span>
          <span className="block truncate max-w-[70px]">
            {match.team2.length > 6 ? match.team2.slice(0, 6) + "…" : match.team2}
          </span>
        </div>
        {match.isCompleted && match.result ? (
          <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            {match.result.length > 7 ? match.result.slice(0, 7) + "…" : match.result} ✓
          </span>
        ) : (
          <span className="text-[8px] text-muted-foreground/40 uppercase tracking-widest">
            {formatMatchDate(match.matchDate)}
          </span>
        )}
      </div>
    </th>
  );
}

function MemberRow({
  member,
  matches,
}: {
  member: WcBracketGridMember;
  matches: WcBracketGridMatch[];
}) {
  const correctCount = Object.values(member.picks).filter((p) => p.isCorrect === true).length;
  const pickCount = Object.keys(member.picks).length;

  return (
    <tr className="hover:bg-muted/5 transition-colors group">
      <td className="px-3 py-2 border-b border-border/20 border-r border-r-border/20 sticky left-0 bg-card group-hover:bg-muted/5 z-10 min-w-[120px] max-w-[160px]">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-xs text-foreground truncate">
            {member.displayName ?? `User ${member.userId}`}
          </span>
          <span className="text-[9px] text-muted-foreground/50 font-mono">
            {correctCount}/{pickCount} ✓
          </span>
        </div>
      </td>
      {matches.map((match) => (
        <PickCell
          key={match.espnEventId}
          pick={member.picks[match.espnEventId]}
          match={match}
        />
      ))}
    </tr>
  );
}

export function BracketPickGrid({ poolId }: { poolId: number }) {
  const [selectedRound, setSelectedRound] = useState<string | undefined>(undefined);

  const params = selectedRound ? { round: selectedRound } : undefined;

  const { data, isLoading, isError } = useGetWcBracketRoundAllPicks(poolId, params, {
    query: {
      queryKey: getGetWcBracketRoundAllPicksQueryKey(poolId, params),
      refetchInterval: 60_000,
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground text-sm border border-dashed border-border/40 rounded-xl">
        Could not load the picks grid. Try refreshing.
      </div>
    );
  }

  const { roundLabel, currentRound, availableRounds, matches, members } = data;

  // Build the ordered list of rounds to show in the selector:
  // all rounds with picks, plus the current active round, deduped and ordered.
  const selectorRoundSet = new Set([...availableRounds, currentRound]);
  const selectorRounds = ROUND_ORDER.filter((r) => selectorRoundSet.has(r));

  // The round currently displayed (from the response)
  const displayedRound = data.round;

  function handleDownloadPdf() {
    const matchColHeaders = matches.map((m) => `${m.team1} vs ${m.team2}`);
    const pdfRows = members.map((member) => {
      const correctCount = Object.values(member.picks).filter((p) => p.isCorrect === true).length;
      const pickCount = Object.keys(member.picks).length;
      const pickCells = matches.map((match) => {
        const pick = member.picks[match.espnEventId];
        if (!pick) return "—";
        const suffix = pick.isCorrect === true ? " \u2713" : pick.isCorrect === false ? " \u2717" : "";
        return `${pick.pickedTeam}${suffix}`;
      });
      return { cells: [member.displayName ?? `User ${member.userId}`, ...pickCells, `${correctCount}/${pickCount}`] };
    });
    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    downloadGridPdf({
      filename: `wcup_bracket_${roundLabel.replace(/\s+/g, "_")}.pdf`,
      poolName: "WCUP BRACKET",
      sport: `World Cup · Season ${new Date().getFullYear()}`,
      subtitle: `${roundLabel} · ${members.length} player${members.length !== 1 ? "s" : ""} · ${matches.length} match${matches.length !== 1 ? "es" : ""}`,
      columns: ["Member", ...matchColHeaders, "Score"],
      rows: pdfRows,
      footer: `${roundLabel} · ${today}`,
    });
  }

  return (
    <div className="space-y-4">
      {/* Round selector — only shown when multiple rounds are available */}
      {selectorRounds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {selectorRounds.map((round) => {
            const isActive = round === displayedRound;
            const isCurrent = round === currentRound;
            return (
              <button
                key={round}
                type="button"
                onClick={() => setSelectedRound(round === currentRound ? undefined : round)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  isActive
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-card border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {ROUND_LABEL[round] ?? round}
                {isCurrent && (
                  <span className={cn(
                    "text-[8px] font-bold uppercase tracking-widest px-1 py-0.5 rounded-sm",
                    isActive ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground/60",
                  )}>
                    Live
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bebas text-3xl tracking-wider text-foreground leading-none">
            {roundLabel}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            All members' picks · {matches.length} match{matches.length !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest">
            <span className="flex items-center gap-1 text-green-400">
              <Check className="w-3 h-3" /> Correct
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <X className="w-3 h-3" /> Wrong
            </span>
            <span className="flex items-center gap-1 text-muted-foreground/50">
              — No pick
            </span>
          </div>
          {members.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="font-bebas text-base tracking-wider gap-1.5 h-8"
            >
              <Download className="w-4 h-4" /> Download PDF
            </Button>
          )}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted-foreground text-sm border border-dashed border-border/40 rounded-xl">
          No matches available for this round yet.
        </div>
      ) : (
        /* Scrollable table */
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm [scrollbar-width:thin]">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left border-b-2 border-border/40 border-r border-r-border/20 sticky left-0 bg-card z-20 min-w-[120px] max-w-[160px]">
                  <span className="font-bebas text-base tracking-wider text-muted-foreground">
                    Member
                  </span>
                </th>
                {matches.map((match) => (
                  <MatchHeader key={match.espnEventId} match={match} />
                ))}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={matches.length + 1}
                    className="px-4 py-8 text-center text-muted-foreground text-sm"
                  >
                    No members yet.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <MemberRow key={member.userId} member={member} matches={matches} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
