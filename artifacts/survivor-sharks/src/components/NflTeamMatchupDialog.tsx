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

type MatchupLeader = {
  category: string;
  playerName: string;
  summary: string;
};

type MatchupSide = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  logo: string | null;
  primaryColor: string | null;
  alternateColor: string | null;
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
  leaders: MatchupLeader[];
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

function hexToRgba(hex: string | null | undefined, alpha: number): string {
  if (!hex) return `rgba(120, 120, 120, ${alpha})`;
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(120, 120, 120, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(120, 120, 120, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function StatLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-muted-foreground leading-snug">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(value)}</span>
    </div>
  );
}

function TeamSeasonColumn({
  side,
  roleLabel,
  logoFallback,
}: {
  side: MatchupSide;
  roleLabel: "Away" | "Home";
  logoFallback?: string | null;
}) {
  const brand = side.primaryColor ?? side.alternateColor;
  const logo = side.logo ?? logoFallback ?? null;
  const panelStyle: React.CSSProperties = {
    background: `linear-gradient(165deg, ${hexToRgba(brand, 0.22)} 0%, ${hexToRgba(brand, 0.04)} 55%, transparent 100%)`,
    borderColor: hexToRgba(brand, 0.45),
    boxShadow: brand ? `inset 0 1px 0 ${hexToRgba(brand, 0.25)}` : undefined,
  };

  return (
    <div className="rounded-lg border p-3 space-y-3 min-w-0" style={panelStyle}>
      <div className="space-y-1.5 border-b border-border/30 pb-2">
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: brand ?? undefined }}
        >
          {roleLabel}
        </p>
        <div className="flex items-center gap-2 min-w-0">
          {logo ? (
            <img src={logo} alt="" className="w-10 h-10 object-contain shrink-0 drop-shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted/40 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-bebas text-xl leading-none tracking-wide">{side.abbreviation}</p>
            <p className="text-[10px] text-muted-foreground truncate">{side.displayName}</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/90 tabular-nums">
          {side.records.overall ?? "—"}
          <span className="text-muted-foreground/45">
            {" "}
            · H {side.records.home ?? "—"} · A {side.records.away ?? "—"}
          </span>
        </p>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/85 mb-0.5">
          Offense
        </p>
        <p className="text-[9px] text-muted-foreground/60 mb-1.5">Team average per game.</p>
        <StatLine label="Pass yards" value={side.offense.passYpg} />
        <StatLine label="Rush yards" value={side.offense.rushYpg} />
        <StatLine label="Total yards" value={side.offense.totalYpg} />
        <StatLine label="Points" value={side.offense.ppg} />
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/85 mb-0.5">
          Defense
        </p>
        <p className="text-[9px] text-muted-foreground/60 mb-1.5">Opponents average per game.</p>
        <StatLine label="Pass yards allowed" value={side.defense.passYpg} />
        <StatLine label="Rush yards allowed" value={side.defense.rushYpg} />
        <StatLine label="Total yards allowed" value={side.defense.totalYpg} />
        <StatLine label="Points allowed" value={side.defense.ppg} />
      </div>

      {side.leaders.length > 0 && (
        <div className="pt-1 border-t border-border/25">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/85 mb-1.5">
            Team leaders
          </p>
          <ul className="space-y-2">
            {side.leaders.map((leader) => (
              <li key={`${leader.category}-${leader.playerName}`} className="text-[10px] leading-snug">
                <p className="font-semibold text-foreground/90">{leader.playerName}</p>
                <p className="text-muted-foreground/55">{leader.category}</p>
                <p className="text-muted-foreground/75 tabular-nums">{leader.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
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
          throw new Error(body?.error ?? "Could not load season stats");
        }
        const json = (await res.json()) as MatchupPayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load season stats");
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
      : "Season stats";

  const seasonLabel = data?.season ?? season ?? new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 space-y-1">
          <DialogTitle className="font-bebas text-2xl tracking-wide">
            Season stats · {title}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {seasonLabel} regular-season team profile and leaders (ESPN). How each club is playing this
            year — not history between these teams.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-5 py-4 space-y-3 max-h-[78vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading season stats…
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
                <TeamSeasonColumn
                  side={data.away}
                  roleLabel="Away"
                  logoFallback={game?.awayTeam.logoUrl}
                />
                <TeamSeasonColumn
                  side={data.home}
                  roleLabel="Home"
                  logoFallback={game?.homeTeam.logoUrl}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}