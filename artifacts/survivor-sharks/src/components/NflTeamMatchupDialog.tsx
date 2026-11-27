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

function MatchupRow({
  label,
  awayOff,
  homeDef,
  homeOff,
  awayDef,
}: {
  label: string;
  awayOff: number | null;
  homeDef: number | null;
  homeOff: number | null;
  awayDef: number | null;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 text-center">
        {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm tabular-nums">
          <span className="font-semibold text-sky-400 w-10 text-left">{fmt(awayOff)}</span>
          <span className="text-[10px] text-muted-foreground/60 flex-1 text-center">Off / Def</span>
          <span className="font-semibold text-rose-400 w-10 text-right">{fmt(homeDef)}</span>
        </div>
        {statBar(awayOff, homeDef, "bg-sky-500/80", "bg-rose-500/80")}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm tabular-nums">
          <span className="font-semibold text-rose-400 w-10 text-left">{fmt(homeOff)}</span>
          <span className="text-[10px] text-muted-foreground/60 flex-1 text-center">Off / Def</span>
          <span className="font-semibold text-sky-400 w-10 text-right">{fmt(awayDef)}</span>
        </div>
        {statBar(homeOff, awayDef, "bg-rose-500/80", "bg-sky-500/80")}
      </div>
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
          <DialogDescription className="text-xs">
            Season averages — offense vs opposing defense (yards from ESPN).
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

              <div className="space-y-5 pt-1">
                <MatchupRow
                  label="Pass yards / game"
                  awayOff={data.away.offense.passYpg}
                  homeDef={data.home.defense.passYpg}
                  homeOff={data.home.offense.passYpg}
                  awayDef={data.away.defense.passYpg}
                />
                <MatchupRow
                  label="Rush yards / game"
                  awayOff={data.away.offense.rushYpg}
                  homeDef={data.home.defense.rushYpg}
                  homeOff={data.home.offense.rushYpg}
                  awayDef={data.away.defense.rushYpg}
                />
                <MatchupRow
                  label="Total yards / game"
                  awayOff={data.away.offense.totalYpg}
                  homeDef={data.home.defense.totalYpg}
                  homeOff={data.home.offense.totalYpg}
                  awayDef={data.away.defense.totalYpg}
                />
                <MatchupRow
                  label="Points / game"
                  awayOff={data.away.offense.ppg}
                  homeDef={data.home.defense.ppg}
                  homeOff={data.home.offense.ppg}
                  awayDef={data.away.defense.ppg}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}