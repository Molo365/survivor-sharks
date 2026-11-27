import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

export type NflMatchupDialogGame = {
  id: string;
  awayTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null };
  homeTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null };
};

type MatchupSide = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  logo: string | null;
  records: { overall: string | null; home: string | null; away: string | null };
  offense: {
    passYpg: number | null;
    rushYpg: number | null;
    totalYpg: number | null;
    ppg: number | null;
  };
  defense: {
    passYpg: number | null;
    rushYpg: number | null;
    totalYpg: number | null;
    ppg: number | null;
  };
};

type MatchupPayload = {
  season: number;
  away: MatchupSide;
  home: MatchupSide;
  spread: {
    summary: string | null;
    favoriteTeamId: string | null;
    spread: number | null;
  };
};

const AWAY_TEXT = "text-sky-400";
const HOME_TEXT = "text-rose-400";
const AWAY_BAR = "bg-sky-500/80";
const HOME_BAR = "bg-rose-500/80";

function statBar(
  left: number | null,
  right: number | null,
  leftColor: string,
  rightColor: string,
) {
  if (left == null && right == null) return null;
  const l = left ?? 0;
  const r = right ?? 0;
  const total = l + r || 1;
  const leftPct = Math.round((l / total) * 100);
  const rightPct = 100 - leftPct;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
      <div className={cn("h-full transition-all", leftColor)} style={{ width: `${leftPct}%` }} />
      <div className={cn("h-full transition-all", rightColor)} style={{ width: `${rightPct}%` }} />
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** One matchup line: offense YPG (left) vs opposing defense yards allowed (right). */
function MatchupCompareLine({
  offenseAbbr,
  offenseValue,
  offenseTextClass,
  offenseBarClass,
  defenseAbbr,
  defenseValue,
  defenseTextClass,
  defenseBarClass,
}: {
  offenseAbbr: string;
  offenseValue: number | null;
  offenseTextClass: string;
  offenseBarClass: string;
  defenseAbbr: string;
  defenseValue: number | null;
  defenseTextClass: string;
  defenseBarClass: string;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-border/25 bg-muted/10 px-2.5 py-2">
      <div className="flex items-center justify-between gap-1 text-[10px] leading-tight">
        <span className={cn("font-semibold truncate", offenseTextClass)}>
          <span className="font-bebas text-xs">{offenseAbbr}</span>
          <span className="text-muted-foreground/80 font-normal"> offense</span>
        </span>
        <span className="text-[9px] text-muted-foreground/50 shrink-0 px-1">vs</span>
        <span className={cn("font-semibold truncate text-right", defenseTextClass)}>
          <span className="font-bebas text-xs">{defenseAbbr}</span>
          <span className="text-muted-foreground/80 font-normal"> defense</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm tabular-nums font-semibold">
        <span className={cn("w-14 text-left", offenseTextClass)}>{fmt(offenseValue)}</span>
        <span className="text-[9px] text-muted-foreground/45 font-normal flex-1 text-center">
          yds / g
        </span>
        <span className={cn("w-14 text-right", defenseTextClass)}>{fmt(defenseValue)}</span>
      </div>
      {statBar(offenseValue, defenseValue, offenseBarClass, defenseBarClass)}
    </div>
  );
}

function MatchupStatBlock({
  title,
  unitLabel,
  awayAbbr,
  homeAbbr,
  awayOffense,
  homeDefense,
  homeOffense,
  awayDefense,
}: {
  title: string;
  unitLabel: string;
  awayAbbr: string;
  homeAbbr: string;
  awayOffense: number | null;
  homeDefense: number | null;
  homeOffense: number | null;
  awayDefense: number | null;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 text-center">
        {title}
      </p>
      <MatchupCompareLine
        offenseAbbr={awayAbbr}
        offenseValue={awayOffense}
        offenseTextClass={AWAY_TEXT}
        offenseBarClass={AWAY_BAR}
        defenseAbbr={homeAbbr}
        defenseValue={homeDefense}
        defenseTextClass={HOME_TEXT}
        defenseBarClass={HOME_BAR}
      />
      <MatchupCompareLine
        offenseAbbr={homeAbbr}
        offenseValue={homeOffense}
        offenseTextClass={HOME_TEXT}
        offenseBarClass={HOME_BAR}
        defenseAbbr={awayAbbr}
        defenseValue={awayDefense}
        defenseTextClass={AWAY_TEXT}
        defenseBarClass={AWAY_BAR}
      />
      <p className="text-[9px] text-center text-muted-foreground/45 -mt-0.5">
        {unitLabel}
      </p>
    </div>
  );
}

export function NflTeamMatchupDialog({
  open,
  onOpenChange,
  game,
  season,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: NflMatchupDialogGame | null;
  season?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchupPayload | null>(null);

  useEffect(() => {
    if (!open || !game) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const year = season ?? new Date().getFullYear();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("auth_token");
        const params = new URLSearchParams({
          awayTeamId: game.awayTeam.id,
          homeTeamId: game.homeTeam.id,
          season: String(year),
          eventId: game.id,
        });
        const res = await fetch(`/api/nfl/matchup?${params}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not load matchup stats");
        }
        const json = (await res.json()) as MatchupPayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load matchup stats");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, game, season]);

  const title =
    game != null
      ? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
      : "Team matchup";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 space-y-1">
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary/80" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Season averages from ESPN. Each category has two comparisons: away offense vs home
            defense, then home offense vs away defense.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading stats…
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-destructive/90 py-6 text-center">{error}</p>
          )}

          {!loading && data && (
            <>
              {data.spread.summary && (
                <p className="text-center text-sm font-mono font-semibold text-yellow-400/90">
                  Spread: {data.spread.summary}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                {[data.away, data.home].map((side, i) => (
                  <div
                    key={side.teamId}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 space-y-1",
                      i === 0 ? "border-sky-500/30 bg-sky-500/5" : "border-rose-500/30 bg-rose-500/5",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {side.logo ? (
                        <img src={side.logo} alt="" className="w-7 h-7 object-contain" />
                      ) : null}
                      <span className="font-bebas text-lg leading-none">{side.abbreviation}</span>
                      <span className="text-[9px] uppercase text-muted-foreground/60">
                        {i === 0 ? "away" : "home"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">
                      {side.displayName}
                    </p>
                    <p className="text-[11px] tabular-nums">
                      <span className="text-muted-foreground/70">Ovl </span>
                      {side.records.overall ?? "—"}
                      <span className="text-muted-foreground/50 mx-1">·</span>
                      <span className="text-muted-foreground/70">H </span>
                      {side.records.home ?? "—"}
                      <span className="text-muted-foreground/50 mx-1">·</span>
                      <span className="text-muted-foreground/70">A </span>
                      {side.records.away ?? "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-border/30 bg-muted/15 px-3 py-2 text-[10px] text-muted-foreground/75 leading-relaxed space-y-0.5">
                <p>
                  <span className={AWAY_TEXT}>{data.away.abbreviation}</span> = away ·{" "}
                  <span className={HOME_TEXT}>{data.home.abbreviation}</span> = home
                </p>
                <p>
                  Each block has <strong className="font-semibold text-foreground/70">two rows</strong>:{" "}
                  that team&apos;s <strong className="font-semibold text-foreground/70">offense</strong> (left
                  number) vs the opponent&apos;s{" "}
                  <strong className="font-semibold text-foreground/70">defense</strong> (right — yards they
                  allow per game).
                </p>
              </div>

              <div className="space-y-5 pt-1">
                <MatchupStatBlock
                  title="Pass yards / game"
                  unitLabel="Season passing yards per game"
                  awayAbbr={data.away.abbreviation}
                  homeAbbr={data.home.abbreviation}
                  awayOffense={data.away.offense.passYpg}
                  homeDefense={data.home.defense.passYpg}
                  homeOffense={data.home.offense.passYpg}
                  awayDefense={data.away.defense.passYpg}
                />
                <MatchupStatBlock
                  title="Rush yards / game"
                  unitLabel="Season rushing yards per game"
                  awayAbbr={data.away.abbreviation}
                  homeAbbr={data.home.abbreviation}
                  awayOffense={data.away.offense.rushYpg}
                  homeDefense={data.home.defense.rushYpg}
                  homeOffense={data.home.offense.rushYpg}
                  awayDefense={data.away.defense.rushYpg}
                />
                <MatchupStatBlock
                  title="Total yards / game"
                  unitLabel="Season total yards per game"
                  awayAbbr={data.away.abbreviation}
                  homeAbbr={data.home.abbreviation}
                  awayOffense={data.away.offense.totalYpg}
                  homeDefense={data.home.defense.totalYpg}
                  homeOffense={data.home.offense.totalYpg}
                  awayDefense={data.away.defense.totalYpg}
                />
                <MatchupStatBlock
                  title="Points / game"
                  unitLabel="Season points scored vs points allowed per game"
                  awayAbbr={data.away.abbreviation}
                  homeAbbr={data.home.abbreviation}
                  awayOffense={data.away.offense.ppg}
                  homeDefense={data.home.defense.ppg}
                  homeOffense={data.home.offense.ppg}
                  awayDefense={data.away.defense.ppg}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}