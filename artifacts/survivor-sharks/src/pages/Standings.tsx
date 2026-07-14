import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface MyStanding {
  rank: number;
  correct: number;
  picked: number;
  hasPicks: boolean;
  status: string | null;
  eliminatedWeek: number | null;
  score: number | null;
  maxScore: number | null;
}

interface PoolStats {
  poolId: number;
  poolName: string;
  poolType: string;
  sport: string;
  totalPlayers: number;
  isActive: boolean;
  myStanding: MyStanding;
}

const SPORT_LABEL: Record<string, string> = {
  nfl: "NFL",
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  fifa: "Soccer",
  worldcup: "World Cup",
};

const SPORT_EMOJI: Record<string, string> = {
  nfl: "🏈",
  mlb: "⚾",
  nba: "🏀",
  nhl: "🏒",
  fifa: "⚽",
  worldcup: "🌍",
};

const SURVIVOR_TYPES = new Set(["season", "weekly", "mid_season"]);

function SportBadge({ sport }: { sport: string }) {
  const label = SPORT_LABEL[sport] ?? sport.toUpperCase();
  const emoji = SPORT_EMOJI[sport] ?? "🏆";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground border border-border/20">
      {emoji} {label}
    </span>
  );
}

function rankColor(rank: number): string {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-orange-400";
  return "text-foreground";
}

function scoreSummary(pool: PoolStats): string | null {
  const { poolType, myStanding: s } = pool;

  if (SURVIVOR_TYPES.has(poolType)) {
    if (s.status === "alive") return "Alive";
    if (s.status === "eliminated" && s.eliminatedWeek != null)
      return `Eliminated · Week ${s.eliminatedWeek}`;
    return s.status ?? null;
  }

  if (poolType === "nfl_confidence" || poolType === "nfl_confidence_weekly") {
    return s.score != null ? `${s.score} pts` : null;
  }

  if (poolType === "nfl_division_predictor") {
    return s.score != null ? `${s.score}/96 pts` : null;
  }

  if (poolType === "group_stage_predictor") {
    return s.score != null ? `${s.score}/144 pts` : null;
  }

  // pickem_season, pickem, wc_bracket — correct/picked
  if (s.picked > 0) return `${s.correct}/${s.picked} correct`;
  return null;
}

function RankDisplay({ rank, totalPlayers }: { rank: number; totalPlayers: number }) {
  if (rank === 0) {
    return (
      <span className="text-sm text-muted-foreground/50">No picks yet</span>
    );
  }
  return (
    <div className="flex items-baseline gap-1">
      <span className={`text-3xl font-black tabular-nums leading-none ${rankColor(rank)}`}>
        #{rank}
      </span>
      {totalPlayers > 0 && (
        <span className="text-sm text-muted-foreground/60 font-medium">
          of {totalPlayers}
        </span>
      )}
    </div>
  );
}

function PoolCard({ pool, ended = false }: { pool: PoolStats; ended?: boolean }) {
  const [, navigate] = useLocation();
  const summary = scoreSummary(pool);
  const { rank } = pool.myStanding;

  const isAlive = pool.myStanding.status === "alive";
  const isEliminated = pool.myStanding.status === "eliminated";

  return (
    <button
      type="button"
      onClick={() => navigate(`/pools/${pool.poolId}`)}
      className="w-full text-left flex items-center gap-4 px-4 py-4 rounded-lg border border-border/20 bg-white/[0.02] hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer"
    >
      {/* Rank column */}
      <div className="flex-shrink-0 w-20 flex flex-col items-center justify-center">
        <RankDisplay rank={rank} totalPlayers={pool.totalPlayers} />
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-border/20 flex-shrink-0" />

      {/* Pool info column */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-foreground leading-tight break-words">
              {pool.poolName}
            </span>
            {ended && (
              <span className="flex-shrink-0 text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-white/[0.06] text-muted-foreground/50 border border-border/20">
                Ended
              </span>
            )}
          </div>
          <SportBadge sport={pool.sport} />
        </div>

        {summary && (
          <span
            className={`text-xs font-medium leading-snug ${
              isAlive
                ? "text-green-400"
                : isEliminated
                ? "text-muted-foreground/50"
                : "text-muted-foreground/70"
            }`}
          >
            {summary}
          </span>
        )}
      </div>
    </button>
  );
}

export default function Standings() {
  const { logout } = useAuth();
  const [pools, setPools] = useState<PoolStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    setLoading(true);
    setError(false);
    fetch("/api/dashboard/pickem-stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<PoolStats[]>;
      })
      .then((data) => {
        // Sort within each group: ranked ascending, unranked (rank 0) at bottom
        const sortFn = (a: PoolStats, b: PoolStats) => {
          const ra = a.myStanding.rank;
          const rb = b.myStanding.rank;
          if (ra === 0 && rb === 0) return 0;
          if (ra === 0) return 1;
          if (rb === 0) return -1;
          return ra - rb;
        };
        setPools([...data].sort(sortFn));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{
      backgroundImage: "url('/shark-bg.jpg')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
      backgroundRepeat: "no-repeat",
      minHeight: "100vh",
    }}>
      <div style={{ backgroundColor: "rgba(0, 0, 0, 0.72)", minHeight: "100vh" }}>
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(20,80,200,0.12),transparent)] pointer-events-none -z-10" />

      <div className="max-w-lg mx-auto px-4 pt-10 pb-24">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-bebas text-5xl tracking-wide text-foreground leading-none">
              Standings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your current rank across all pools
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="Log out" className="mt-1 -mr-2 text-muted-foreground hover:text-foreground">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">
              Unable to load standings
            </p>
          </div>
        ) : pools.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">
              You're not in any pools yet
            </p>
          </div>
        ) : (
          (() => {
            const activePools = pools.filter((p) => p.isActive);
            const endedPools = pools.filter((p) => !p.isActive);
            return (
              <div className="space-y-3">
                {activePools.map((pool) => (
                  <PoolCard key={pool.poolId} pool={pool} />
                ))}

                {endedPools.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 pt-4 pb-1">
                      <div className="flex-1 h-px bg-border/20" />
                      <span className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/50">
                        Past Pools
                      </span>
                      <div className="flex-1 h-px bg-border/20" />
                    </div>
                    {endedPools.map((pool) => (
                      <PoolCard key={pool.poolId} pool={pool} ended />
                    ))}
                  </>
                )}
              </div>
            );
          })()
        )}
      </div>
      </div>
    </div>
  );
}
