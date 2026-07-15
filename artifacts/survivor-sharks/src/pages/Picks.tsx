import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface PoolSummary {
  poolId: number;
  poolName: string;
  poolType: string;
  sport: string;
  currentWeek: number;
  pickStatus: "submitted" | "pending" | "not_required";
  summary: string | null;
  poolUrl: string;
  hasLiveGames?: boolean;
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

function SportBadge({ sport }: { sport: string }) {
  const label = SPORT_LABEL[sport] ?? sport.toUpperCase();
  const emoji = SPORT_EMOJI[sport] ?? "🏆";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground border border-border/20">
      {emoji} {label}
    </span>
  );
}

function StatusBadge({ status }: { status: PoolSummary["pickStatus"] }) {
  if (status === "pending") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span className="text-[12px] font-semibold text-amber-400 tracking-wide">
          Pick needed
        </span>
      </div>
    );
  }
  if (status === "submitted") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-green-400 text-sm leading-none">✓</span>
        <span className="text-[12px] font-semibold text-green-400 tracking-wide">
          Picks submitted
        </span>
      </div>
    );
  }
  return (
    <span className="text-[12px] font-semibold text-muted-foreground/50 tracking-wide">
      No picks this week
    </span>
  );
}

function PoolCard({ pool }: { pool: PoolSummary }) {
  const [, navigate] = useLocation();

  return (
    <button
      type="button"
      onClick={() => navigate(pool.poolUrl)}
      className="w-full text-left flex flex-col gap-2 px-4 py-4 rounded-lg border border-border/20 bg-white/[0.02] hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-bold text-foreground leading-tight">
          {pool.poolName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {pool.hasLiveGames && (
            <div className="flex items-center gap-1">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-[11px] font-semibold text-green-400 tracking-wide">Live</span>
            </div>
          )}
          <SportBadge sport={pool.sport} />
        </div>
      </div>

      <StatusBadge status={pool.pickStatus} />

      {pool.summary && (
        <p className="text-xs text-muted-foreground/70 leading-snug">
          {pool.summary}
        </p>
      )}
    </button>
  );
}

export default function Picks() {
  const { logout } = useAuth();
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    setLoading(true);
    setError(false);
    fetch("/api/picks/summary", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<PoolSummary[]>;
      })
      .then((data) => {
        setPools(data);
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
              My Picks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              This week's action across all your pools
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
            <p className="text-muted-foreground text-sm">Unable to load picks</p>
          </div>
        ) : pools.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">
              You're not in any active pools yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pools.map((pool) => (
              <PoolCard key={pool.poolId} pool={pool} />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
