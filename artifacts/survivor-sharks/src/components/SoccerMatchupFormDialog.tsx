import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { SoccerFormDots, type SoccerFormResult } from "@/components/SoccerFormDots";

type FormMatch = {
  result: SoccerFormResult;
  shortName: string | null;
  scoreLine: string | null;
  date: string | null;
};

type MatchupFormPayload = {
  sport: string;
  away: FormMatch[];
  home: FormMatch[];
};

function TeamFormColumn({
  abbr,
  name,
  logoUrl,
  matches,
}: {
  abbr: string;
  name: string;
  logoUrl?: string | null;
  matches: FormMatch[];
}) {
  return (
    <div className="rounded-lg border border-border/40 p-3 space-y-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-8 h-8 object-contain shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted/40 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-bebas text-lg leading-none tracking-wide">{abbr}</p>
          <p className="text-[10px] text-muted-foreground truncate">{name}</p>
        </div>
      </div>
      <SoccerFormDots form={matches.map((m) => m.result)} size="md" />
      <p className="text-[9px] text-muted-foreground/55 uppercase tracking-wider font-semibold">Last 5</p>
      <ul className="space-y-1.5">
        {matches.length === 0 && (
          <li className="text-xs text-muted-foreground/60">No recent results</li>
        )}
        {matches.map((m, i) => (
          <li key={i} className="text-[10px] leading-snug flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground/75 truncate">{m.shortName ?? "—"}</span>
            <span className="shrink-0 tabular-nums text-foreground/80">{m.scoreLine ?? "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type SoccerMatchupFormGame = {
  awayTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null };
  homeTeam: { id: string; abbreviation: string; name: string; logoUrl?: string | null };
};

export function SoccerMatchupFormDialog({
  open,
  onOpenChange,
  sport,
  game,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sport: string;
  game: SoccerMatchupFormGame | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchupFormPayload | null>(null);

  useEffect(() => {
    if (!open || !game) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("auth_token");
        const params = new URLSearchParams({
          awayTeamId: game.awayTeam.id,
          homeTeamId: game.homeTeam.id,
          sport,
        });
        const res = await fetch(`/api/soccer/matchup-form?${params}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not load form");
        }
        const json = (await res.json()) as MatchupFormPayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load form");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, game, sport]);

  const title =
    game != null
      ? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
      : "Team form";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 space-y-1">
          <DialogTitle className="font-bebas text-2xl tracking-wide">Form · {title}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Last five completed matches (W / D / L). Green win, blue draw, red loss — from ESPN schedules.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-5 py-4 space-y-3 max-h-[78vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading form…
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-destructive/90 py-6 text-center">{error}</p>
          )}
          {!loading && data && game && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <TeamFormColumn
                abbr={game.awayTeam.abbreviation}
                name={game.awayTeam.name}
                logoUrl={game.awayTeam.logoUrl}
                matches={data.away}
              />
              <TeamFormColumn
                abbr={game.homeTeam.abbreviation}
                name={game.homeTeam.name}
                logoUrl={game.homeTeam.logoUrl}
                matches={data.home}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}