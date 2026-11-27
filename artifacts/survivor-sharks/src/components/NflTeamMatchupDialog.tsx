import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

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

function fmt(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function StatLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(value)}</span>
    </div>
  );
}

function TeamStatsColumn({
  side,
  roleLabel,
}: {
  side: MatchupSide;
  roleLabel: "Away" | "Home";
}) {
  const logo = side.logo;
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-3 min-w-0">
      <div className="space-y-1.5 border-b border-border/35 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          {roleLabel}
        </p>
        <div className="flex items-center gap-2 min-w-0">
          {logo ? (
            <img src={logo} alt="" className="w-9 h-9 object-contain shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-muted/40 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-bebas text-xl leading-none tracking-wide">{side.abbreviation}</p>
            <p className="text-[10px] text-muted-foreground truncate">{side.displayName}</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/90 tabular-nums">
          Record: {side.records.overall ?? "—"}
          <span className="text-muted-foreground/45"> (H {side.records.home ?? "—"} · A {side.records.away ?? "—"})</span>
        </p>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/80 mb-1">
          With the ball (offense)
        </p>
        <p className="text-[9px] text-muted-foreground/65 mb-1.5 leading-snug">
          Season average per game — what this team does.
        </p>
        <StatLine label="Pass yards" value={side.offense.passYpg} />
        <StatLine label="Rush yards" value={side.offense.rushYpg} />
        <StatLine label="Total yards" value={side.offense.totalYpg} />
        <StatLine label="Points" value={side.offense.ppg} />
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/80 mb-1">
          Without the ball (defense)
        </p>
        <p className="text-[9px] text-muted-foreground/65 mb-1.5 leading-snug">
          What opponents average against them per game.
        </p>
        <StatLine label="Pass yards allowed" value={side.defense.passYpg} />
        <StatLine label="Rush yards allowed" value={side.defense.rushYpg} />
        <StatLine label="Total yards allowed" value={side.defense.totalYpg} />
        <StatLine label="Points allowed" value={side.defense.ppg} />
      </div>
    </div>
  );
}

function matchupSnapshot(
  away: MatchupSide,
  home: MatchupSide,
): string[] {
  const lines: string[] = [];
  const add = (
    offAbbr: string,
    offStat: number | null,
    unit: string,
    defAbbr: string,
    defStat: number | null,
  ) => {
    if (offStat == null || defStat == null) return;
    lines.push(
      `${offAbbr} ${unit} ~${fmt(offStat)} per game · ${defAbbr} allows ~${fmt(defStat)} to opponents.`,
    );
  };
  add(away.abbreviation, away.offense.passYpg, "passes for", home.abbreviation, home.defense.passYpg);
  add(home.abbreviation, home.offense.passYpg, "passes for", away.abbreviation, away.defense.passYpg);
  add(away.abbreviation, away.offense.rushYpg, "rushes for", home.abbreviation, home.defense.rushYpg);
  add(home.abbreviation, home.offense.rushYpg, "rushes for", away.abbreviation, away.defense.rushYpg);
  return lines.slice(0, 4);
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
      : "Team stats";

  const snapshots = data ? matchupSnapshot(data.away, data.home) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 space-y-1">
          <DialogTitle className="font-bebas text-2xl tracking-wide">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Season averages from ESPN. Each team is shown separately — offense is what they produce, defense is what they allow.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
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

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <TeamStatsColumn side={data.away} roleLabel="Away" />
                <TeamStatsColumn side={data.home} roleLabel="Home" />
              </div>

              {snapshots.length > 0 && (
                <div className="rounded-lg border border-border/35 bg-muted/10 px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Quick read
                  </p>
                  <ul className="text-[11px] text-muted-foreground/90 leading-relaxed space-y-1 list-none">
                    {snapshots.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}