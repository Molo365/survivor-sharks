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

function H2hRow({
  label,
  awayValue,
  homeValue,
  awayDisplay,
  homeDisplay,
}: {
  label: string;
  awayValue: number | string | null;
  homeValue: number | string | null;
  awayDisplay?: string;
  homeDisplay?: string;
}) {
  const left = awayDisplay ?? (typeof awayValue === "number" ? fmt(awayValue) : awayValue);
  const right = homeDisplay ?? (typeof homeValue === "number" ? fmt(homeValue) : homeValue);
  return (
    <div className="grid grid-cols-[1fr_3.25rem_3.25rem] gap-2 items-baseline py-1 border-b border-border/20 last:border-0">
      <span className="text-[11px] text-muted-foreground leading-snug">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-right">{left ?? "—"}</span>
      <span className="text-sm font-semibold tabular-nums text-right">{right ?? "—"}</span>
    </div>
  );
}

function H2hSection({
  title,
  subtitle,
  away,
  home,
  rows,
}: {
  title: string;
  subtitle: string;
  away: MatchupSide;
  home: MatchupSide;
  rows: Array<{ label: string; away: number | null; home: number | null }>;
}) {
  return (
    <div className="space-y-1">
      <div className="pb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/85">{title}</p>
        <p className="text-[9px] text-muted-foreground/60 leading-snug">{subtitle}</p>
      </div>
      {rows.map((r) => (
        <H2hRow key={r.label} label={r.label} awayValue={r.away} homeValue={r.home} />
      ))}
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

  const matchupTitle =
    game != null
      ? `${game.awayTeam.abbreviation} vs ${game.homeTeam.abbreviation}`
      : "Head-to-head";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 space-y-1">
          <DialogTitle className="font-bebas text-2xl tracking-wide">
            Head-to-head · {matchupTitle}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Same stat, both teams, side by side — season average per game (ESPN). Not past games
            between these two teams.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
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

              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                  {(data.away.logo ?? game?.awayTeam.logoUrl) ? (
                    <img
                      src={data.away.logo ?? game?.awayTeam.logoUrl ?? ""}
                      alt=""
                      className="w-10 h-10 object-contain"
                    />
                  ) : null}
                  <p className="font-bebas text-lg leading-none">{data.away.abbreviation}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60">Away</p>
                </div>
                <span className="text-[10px] font-bebas text-muted-foreground/40 shrink-0">VS</span>
                <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                  {(data.home.logo ?? game?.homeTeam.logoUrl) ? (
                    <img
                      src={data.home.logo ?? game?.homeTeam.logoUrl ?? ""}
                      alt=""
                      className="w-10 h-10 object-contain"
                    />
                  ) : null}
                  <p className="font-bebas text-lg leading-none">{data.home.abbreviation}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60">Home</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-4">
                <div className="grid grid-cols-[1fr_3.25rem_3.25rem] gap-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/55 border-b border-border/30 pb-2">
                  <span />
                  <span className="text-right">{data.away.abbreviation}</span>
                  <span className="text-right">{data.home.abbreviation}</span>
                </div>

                <H2hRow
                  label="Record (overall)"
                  awayValue={data.away.records.overall}
                  homeValue={data.home.records.overall}
                />

                <H2hSection
                  title="Offense"
                  subtitle="What each team averages when they have the ball."
                  away={data.away}
                  home={data.home}
                  rows={[
                    { label: "Pass yards / game", away: data.away.offense.passYpg, home: data.home.offense.passYpg },
                    { label: "Rush yards / game", away: data.away.offense.rushYpg, home: data.home.offense.rushYpg },
                    { label: "Total yards / game", away: data.away.offense.totalYpg, home: data.home.offense.totalYpg },
                    { label: "Points / game", away: data.away.offense.ppg, home: data.home.offense.ppg },
                  ]}
                />

                <H2hSection
                  title="Defense"
                  subtitle="What opponents average against each team."
                  away={data.away}
                  home={data.home}
                  rows={[
                    { label: "Pass yards allowed / game", away: data.away.defense.passYpg, home: data.home.defense.passYpg },
                    { label: "Rush yards allowed / game", away: data.away.defense.rushYpg, home: data.home.defense.rushYpg },
                    { label: "Total yards allowed / game", away: data.away.defense.totalYpg, home: data.home.defense.totalYpg },
                    { label: "Points allowed / game", away: data.away.defense.ppg, home: data.home.defense.ppg },
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}