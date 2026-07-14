import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useGetUserBalance } from "@workspace/api-client-react";
import type { UserBalanceActivePool, UserBalancePastPool } from "@workspace/api-client-react";
import { NavBar } from "@/components/NavBar";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KeyRound, Trophy, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

const SPORT_LABELS: Record<string, string> = {
  nfl: "NFL",
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  fifa: "FIFA",
  worldcup: "World Cup",
  intl: "INTL",
};

const POOL_TYPE_LABELS: Record<string, string> = {
  season: "Survivor",
  weekly: "Weekly",
  mid_season: "Mid-Season",
  pickem: "Pick-Em",
  group_stage_predictor: "Group Stage",
  pickem_season: "Season Pick-Em",
  nfl_division_predictor: "Division Predictor",
  dirty_dozen: "Dirty Dozen",
  crazy_8s: "Crazy 8s",
  nfl_confidence: "Confidence",
  nfl_confidence_weekly: "Weekly Confidence",
  wc_bracket: "WC Bracket",
};

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function SportBadge({ sport }: { sport: string }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] font-bebas tracking-wide px-1.5 py-0 border-primary/30 text-primary/70"
    >
      {SPORT_LABELS[sport] ?? sport.toUpperCase()}
    </Badge>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-bebas text-2xl tracking-widest text-foreground/80">{children}</h2>
  );
}

// ── Active pool card ─────────────────────────────────────────────────────────

function ActivePoolCard({ pool }: { pool: UserBalanceActivePool }) {
  return (
    <Link href={`/pools/${pool.poolId}`}>
      <Card className="shark-card hover:border-primary/50 transition-all duration-200 cursor-pointer">
        <CardContent className="p-4 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bebas text-xl tracking-wide text-foreground leading-tight line-clamp-1">
              {pool.poolName}
            </span>
            <Badge className="shrink-0 text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/20">
              In Progress
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SportBadge sport={pool.sport} />
            <span className="text-xs text-muted-foreground">
              {POOL_TYPE_LABELS[pool.poolType] ?? pool.poolType}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-muted-foreground">by {pool.commissionerName}</span>
            <span className="text-xs font-semibold text-foreground">
              {pool.entryFee && pool.entryFee > 0 ? `$${pool.entryFee}` : "Free"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Past pool card (balance view) ────────────────────────────────────────────

function BalancePastPoolCard({ pool }: { pool: UserBalancePastPool }) {
  const isFree = !pool.entryFee || pool.entryFee <= 0;
  const hasPrize = pool.prizeAmount != null && pool.prizeAmount > 0;

  const prizeLabel = isFree
    ? "Free pool"
    : hasPrize
      ? `Prize won: $${Math.round(pool.prizeAmount!)}`
      : "Prize won: $0";

  const prizeColor = hasPrize ? "text-green-400" : "text-muted-foreground/60";

  return (
    <Link href={`/pools/${pool.poolId}`}>
      <Card className="shark-card opacity-80 hover:opacity-100 hover:border-primary/40 transition-all duration-200 cursor-pointer">
        <CardContent className="p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bebas text-xl tracking-wide text-foreground/90 leading-tight line-clamp-1">
              {pool.poolName}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SportBadge sport={pool.sport} />
            <span className="text-xs text-muted-foreground">
              {POOL_TYPE_LABELS[pool.poolType] ?? pool.poolType}
            </span>
            {pool.finishPosition != null && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 font-semibold",
                  pool.finishPosition === 1
                    ? "border-amber-500/40 text-amber-400"
                    : pool.finishPosition === 2
                      ? "border-slate-400/40 text-slate-300"
                      : "border-orange-600/40 text-orange-400",
                )}
              >
                {pool.result === "won" && pool.finishPosition === 1 && (
                  <Trophy className="w-2.5 h-2.5 mr-0.5 inline" />
                )}
                {ordinal(pool.finishPosition)}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {pool.winnerName ? (
                <span className="text-amber-400/80">
                  <Trophy className="w-2.5 h-2.5 inline mr-0.5" />
                  {pool.winnerName}
                </span>
              ) : (
                <span>by {pool.commissionerName}</span>
              )}
            </span>
            <span className={cn("text-xs font-medium shrink-0", prizeColor)}>
              {prizeLabel}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Winnings header ──────────────────────────────────────────────────────────

function WinningsHeader({ pastPools }: { pastPools: UserBalancePastPool[] }) {
  const totalWon = pastPools.reduce((sum, p) => sum + (p.prizeAmount ?? 0), 0);
  const count = pastPools.length;
  return (
    <div>
      <h3 className="font-bebas text-2xl tracking-widest text-foreground">YOUR WINNINGS</h3>
      <p className="text-sm text-muted-foreground">
        {count} pool{count !== 1 ? "s" : ""} played · Total won: ${Math.round(totalWon).toLocaleString()}
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuth();
  const { data: balance, isLoading } = useGetUserBalance();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const initials = (user?.displayName ?? user?.username ?? "?")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="container max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* ── Profile header ── */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center",
              "bg-primary/20 border-2 border-primary/40 text-primary",
              "font-bebas text-4xl tracking-wide",
            )}
          >
            {initials}
          </div>
          <div>
            <p className="font-bebas text-3xl tracking-wide text-foreground">
              {user?.displayName ?? user?.username}
            </p>
            {user?.displayName && (
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            )}
            {user?.createdAt && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Member since {formatMemberSince(user.createdAt)}
              </p>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="balance" className="space-y-6">
          <TabsList className="w-full">
            <TabsTrigger value="balance" className="flex-1 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Balance
            </TabsTrigger>
            <TabsTrigger value="account" className="flex-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Account
            </TabsTrigger>
          </TabsList>

          {/* ── BALANCE tab ── */}
          <TabsContent value="balance" className="space-y-8 mt-0">

            {/* Active Pools */}
            <section className="space-y-4">
              <SectionHeading>Active Pools</SectionHeading>
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : !balance?.activePools.length ? (
                <p className="text-sm text-muted-foreground">No active pools right now.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {balance.activePools.map((pool) => (
                    <ActivePoolCard key={pool.poolId} pool={pool} />
                  ))}
                </div>
              )}
            </section>

            {/* Past Pools */}
            <section className="space-y-4">
              <SectionHeading>Past Pools</SectionHeading>
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : !balance?.pastPools.length ? (
                <p className="text-sm text-muted-foreground">No past pools yet.</p>
              ) : (
                <div className="space-y-4">
                  <WinningsHeader pastPools={balance.pastPools} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {balance.pastPools.map((pool) => (
                      <BalancePastPoolCard key={pool.poolId} pool={pool} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── ACCOUNT tab ── */}
          <TabsContent value="account" className="space-y-4 mt-0">
            <Card className="shark-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Password</p>
                  <p className="text-xs text-muted-foreground">Change your login password</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangePasswordOpen(true)}
                  className="flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Change
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </main>

      {changePasswordOpen && (
        <ChangePasswordDialog onClose={() => setChangePasswordOpen(false)} />
      )}
    </div>
  );
}
