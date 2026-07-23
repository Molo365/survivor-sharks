import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

type FormationPlayer = { jersey: string; name: string; position: string };
type FormationTeam = {
  label: string;
  color: string | null;
  formation: string | null;
  starters: FormationPlayer[];
  bench: FormationPlayer[];
};
type SoccerGameDetail = {
  formationLineups: {
    homeTeam: FormationTeam | null;
    awayTeam: FormationTeam | null;
  } | null;
};

interface SoccerLineupSheetProps {
  open: boolean;
  onClose: () => void;
  gameId: string;
  leagueSlug: string;
  awayAbbr: string;
  homeAbbr: string;
}

function parseFormationRows(formation: string | null): number[] {
  if (!formation) return [1, 4, 3, 3];
  const parts = formation.split("-").map(Number).filter((n) => !isNaN(n) && n > 0);
  return parts.length > 0 ? [1, ...parts] : [1, 4, 3, 3];
}

function getLastName(name: string): string {
  if (!name) return "";
  const parts = name.split(" ");
  return (parts[parts.length - 1] ?? name).slice(0, 10);
}

function teamColor(color: string | null, fallback: string): string {
  if (!color) return fallback;
  const clean = color.replace(/^#/, "");
  return clean.length === 6 || clean.length === 3 ? `#${clean}` : fallback;
}

interface PitchProps {
  homeTeam: FormationTeam;
  awayTeam: FormationTeam;
}

function SoccerPitch({ homeTeam, awayTeam }: PitchProps) {
  const W = 280;
  const H = 440;
  const PX = 10; // pitch x start
  const PY = 10; // pitch y start
  const PW = 260; // pitch width
  const PH = 420; // pitch height

  const homeColor = teamColor(homeTeam.color, "#1d4ed8");
  const awayColor = teamColor(awayTeam.color, "#b91c1c");

  function getPositions(
    starters: FormationPlayer[],
    formation: string | null,
    side: "home" | "away",
  ): { x: number; y: number; player: FormationPlayer }[] {
    const rows = parseFormationRows(formation);
    const n = rows.length; // total rows including GK
    const positions: { x: number; y: number; player: FormationPlayer }[] = [];
    let idx = 0;

    for (let row = 0; row < n; row++) {
      const count = rows[row] ?? 1;
      let y: number;
      if (side === "home") {
        // GK at bottom (row 0 → high y), FWD approaches center
        y = PY + PH - 20 - row * (185 / Math.max(n - 1, 1));
      } else {
        // GK at top (row 0 → low y), FWD approaches center
        y = PY + 20 + row * (185 / Math.max(n - 1, 1));
      }

      for (let col = 0; col < count; col++) {
        const x = PX + (PW * (col + 1)) / (count + 1);
        const player = starters[idx];
        if (player) positions.push({ x, y, player });
        idx++;
      }
    }
    return positions;
  }

  const homePos = getPositions(homeTeam.starters, homeTeam.formation, "home");
  const awayPos = getPositions(awayTeam.starters, awayTeam.formation, "away");

  const cx = PX + PW / 2;
  const cy = PY + PH / 2;
  const paw = 110; // penalty area width
  const pah = 64; // penalty area height
  const syw = 55;  // six-yard box width
  const syh = 26;  // six-yard box height

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Pitch background */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="4" fill="#166534" />
      {/* Alternating stripes */}
      {Array.from({ length: 7 }, (_, i) => (
        <rect
          key={i}
          x={PX}
          y={PY + i * (PH / 7)}
          width={PW}
          height={PH / 7}
          fill={i % 2 === 0 ? "rgba(0,0,0,0.06)" : "transparent"}
        />
      ))}
      {/* Outer border */}
      <rect x={PX} y={PY} width={PW} height={PH} rx="4" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      {/* Center line */}
      <line x1={PX} y1={cy} x2={PX + PW} y2={cy} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      {/* Center circle */}
      <circle cx={cx} cy={cy} r="28" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.5)" />

      {/* Home penalty area (bottom) */}
      <rect
        x={cx - paw / 2} y={PY + PH - pah}
        width={paw} height={pah}
        fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"
      />
      {/* Home 6-yard box */}
      <rect
        x={cx - syw / 2} y={PY + PH - syh}
        width={syw} height={syh}
        fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"
      />
      {/* Home penalty spot */}
      <circle cx={cx} cy={PY + PH - 50} r="1.5" fill="rgba(255,255,255,0.4)" />

      {/* Away penalty area (top) */}
      <rect
        x={cx - paw / 2} y={PY}
        width={paw} height={pah}
        fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"
      />
      {/* Away 6-yard box */}
      <rect
        x={cx - syw / 2} y={PY}
        width={syw} height={syh}
        fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"
      />
      {/* Away penalty spot */}
      <circle cx={cx} cy={PY + 50} r="1.5" fill="rgba(255,255,255,0.4)" />

      {/* Away team markers (top half) */}
      {awayPos.map(({ x, y, player }, i) => (
        <g key={`away-${i}`} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}>
          <circle cx={x} cy={y} r="14" fill={awayColor} stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
          <text
            x={x} y={y + 0.5}
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize="9" fontWeight="bold"
            style={{ fontFamily: "monospace" }}
          >
            {player.jersey}
          </text>
          <text
            x={x} y={y + 21}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.92)" fontSize="7"
            style={{ fontFamily: "sans-serif" }}
          >
            {getLastName(player.name)}
          </text>
        </g>
      ))}

      {/* Home team markers (bottom half) */}
      {homePos.map(({ x, y, player }, i) => (
        <g key={`home-${i}`} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}>
          <circle cx={x} cy={y} r="14" fill={homeColor} stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
          <text
            x={x} y={y + 0.5}
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize="9" fontWeight="bold"
            style={{ fontFamily: "monospace" }}
          >
            {player.jersey}
          </text>
          <text
            x={x} y={y + 21}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.92)" fontSize="7"
            style={{ fontFamily: "sans-serif" }}
          >
            {getLastName(player.name)}
          </text>
        </g>
      ))}

      {/* Team label badges */}
      <rect x={PX + 4} y={PY + 4} width={38} height={14} rx="2" fill="rgba(0,0,0,0.45)" />
      <text x={PX + 8} y={PY + 11.5} fill="rgba(255,255,255,0.8)" fontSize="7.5" fontWeight="600"
        style={{ fontFamily: "sans-serif" }}>
        {awayTeam.label} ↑
      </text>
      <rect x={PX + 4} y={PY + PH - 18} width={38} height={14} rx="2" fill="rgba(0,0,0,0.45)" />
      <text x={PX + 8} y={PY + PH - 10} fill="rgba(255,255,255,0.8)" fontSize="7.5" fontWeight="600"
        style={{ fontFamily: "sans-serif" }}>
        {homeTeam.label} ↓
      </text>
    </svg>
  );
}

function BenchList({ team, color }: { team: FormationTeam; color: string }) {
  if (team.bench.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
        {team.label} bench
      </p>
      {team.bench.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white font-bold text-[9px] shrink-0"
            style={{ backgroundColor: color }}
          >
            {p.jersey}
          </span>
          <span className="text-foreground/80 truncate">{p.name}</span>
          <span className="text-muted-foreground/50 shrink-0">{p.position}</span>
        </div>
      ))}
    </div>
  );
}

export function SoccerLineupSheet({
  open,
  onClose,
  gameId,
  leagueSlug,
  awayAbbr,
  homeAbbr,
}: SoccerLineupSheetProps) {
  const { data, isLoading, isError } = useQuery<SoccerGameDetail>({
    queryKey: ["soccer-lineup", gameId, leagueSlug],
    queryFn: async () => {
      const res = await fetch(
        `/api/scores/game/${encodeURIComponent(gameId)}?sport=${encodeURIComponent(leagueSlug)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch lineup data");
      return res.json() as Promise<SoccerGameDetail>;
    },
    enabled: open && !!gameId && !!leagueSlug,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const fl = data?.formationLineups;
  const homeTeam = fl?.homeTeam ?? null;
  const awayTeam = fl?.awayTeam ?? null;
  const hasLineups = !!(homeTeam?.starters.length || awayTeam?.starters.length);

  const homeColor = teamColor(homeTeam?.color ?? null, "#1d4ed8");
  const awayColor = teamColor(awayTeam?.color ?? null, "#b91c1c");

  const awayFormation = awayTeam?.formation ?? null;
  const homeFormation = homeTeam?.formation ?? null;
  const formationLabel =
    awayFormation || homeFormation
      ? [
          awayAbbr + (awayFormation ? ` ${awayFormation}` : ""),
          homeAbbr + (homeFormation ? ` ${homeFormation}` : ""),
        ].join("  vs  ")
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Lineups
          </DialogTitle>
          {formationLabel && (
            <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">{formationLabel}</p>
          )}
        </DialogHeader>

        <div className="px-4 pb-5 pt-3 space-y-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-[440px] w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          )}

          {isError && (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">Could not load lineup data</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Check back closer to kick-off.</p>
            </div>
          )}

          {!isLoading && !isError && !hasLineups && (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">Lineups not yet available</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                Confirmed lineups are typically released ~1 hour before kick-off.
              </p>
            </div>
          )}

          {!isLoading && !isError && hasLineups && homeTeam && awayTeam && (
            <>
              {/* Formation pitch diagram */}
              <div className="rounded-xl overflow-hidden border border-border/30">
                <SoccerPitch homeTeam={homeTeam} awayTeam={awayTeam} />
              </div>

              {/* Bench / substitutes */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <BenchList team={awayTeam} color={awayColor} />
                <BenchList team={homeTeam} color={homeColor} />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
