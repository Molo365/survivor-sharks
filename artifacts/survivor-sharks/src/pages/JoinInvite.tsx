import React, { useState, useEffect, useCallback } from "react";

import { useParams, useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useJoinPool } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Trophy, AlertCircle, LogIn, UserPlus, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PrizeDisplay } from "@/components/PrizeDisplay";

interface PoolPreview {
  id: number;
  name: string;
  sport: string;
  poolType: string;
  prizePot: number | null;
  prizeStructure: Array<{ place: number; amount: number }> | null;
  prizeMode: "fixed" | "pct";
  entryFee: number | null;
  maxEntries: number | null;
  minEntries: number | null;
  playerCount: number;
  description: string | null;
  season: string | null;
}

const WC_KICKOFF = new Date("2026-06-11T16:00:00Z");

function useCountdown(target: Date) {
  const calc = useCallback(
    () => Math.max(0, target.getTime() - Date.now()),
    [target],
  );
  const [ms, setMs] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setMs(calc()), 1000);
    return () => clearInterval(id);
  }, [calc]);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { days, hours, minutes, seconds, expired: ms === 0 };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(30,144,255,0.08)]">
        <span className="font-bebas text-4xl sm:text-5xl text-primary tabular-nums leading-none">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
        {label}
      </span>
    </div>
  );
}

const POOL_TYPE_LABELS: Record<string, string> = {
  season:                  "Survivor",
  weekly:                  "Weekly Survivor",
  mid_season:              "Mid-Season",
  pickem:                  "Pick-Ems",
  group_stage_predictor:   "Group Stage Predictor",
  pickem_season:           "Pick-Em Season",
  nfl_division_predictor:  "Division Predictor",
  dirty_dozen:             "Dirty Dozen",
  crazy_8s:                "Crazy 8s",
  nfl_confidence:          "Confidence",
  nfl_confidence_weekly:   "Confidence Weekly",
  wc_bracket:              "WC Bracket",
};

const SPORT_META: Record<string, { emoji: string; label: string; color: string }> = {
  worldcup: { emoji: "⚽", label: "World Cup 2026", color: "from-green-900/40 to-blue-900/40" },
  nfl:      { emoji: "🏈", label: "NFL",            color: "from-blue-900/40 to-indigo-900/40" },
  mlb:      { emoji: "⚾", label: "MLB",            color: "from-red-900/30 to-blue-900/30" },
  nba:      { emoji: "🏀", label: "NBA",            color: "from-orange-900/30 to-blue-900/30" },
  nhl:      { emoji: "🏒", label: "NHL",            color: "from-sky-900/30 to-indigo-900/30" },
  intl:     { emoji: "🌍", label: "International",  color: "from-green-900/30 to-teal-900/30" },
};

function StatPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/30 bg-muted/20 px-3.5 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
      <span className="text-primary/70">{icon}</span>
      {children}
    </div>
  );
}

export default function JoinInvite() {
  const params = useParams<{ inviteCode: string }>();
  const inviteCode = (params.inviteCode ?? "").toUpperCase();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const joinPool = useJoinPool();

  const [step, setStep] = useState<1 | 2>(1);
  const [pool, setPool] = useState<PoolPreview | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const countdown = useCountdown(WC_KICKOFF);
  const isWc = pool?.sport === "worldcup";
  const sportMeta = SPORT_META[pool?.sport ?? ""] ?? { emoji: "🏆", label: pool?.sport ?? "Pool", color: "from-primary/20 to-primary/5" };

  useEffect(() => {
    if (!inviteCode) return;
    setFetchLoading(true);
    setFetchError(null);
    fetch(`/api/pools/invite/${inviteCode}/preview`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as any).error ?? "Pool not found");
        }
        return res.json() as Promise<PoolPreview>;
      })
      .then((data) => { setPool(data); setFetchLoading(false); })
      .catch((err: Error) => { setFetchError(err.message); setFetchLoading(false); });
  }, [inviteCode]);

  function handleJoin() {
    if (authLoading) return;

    if (!user) {
      localStorage.setItem("pending_invite_code", inviteCode);
      setLocation("/register");
      return;
    }

    joinPool.mutate(
      {
        data: {
          inviteCode,
        },
      },
      {
        onSuccess: (data: any) => {
          toast({ title: "You're in! 🎉", description: `Successfully joined ${pool?.name ?? "the pool"}.` });
          setLocation(`/pools/${data.id}`);
        },
        onError: (err: any) => {
          const msg: string = err?.data?.error ?? err?.message ?? "Failed to join pool";
          if (msg.toLowerCase().includes("already a member")) {
            setLocation(`/pools/${pool!.id}`);
          } else {
            toast({ variant: "destructive", title: "Couldn't join", description: msg });
          }
        },
      },
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-[#060810] -z-10" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_30%,rgba(20,80,200,0.18),transparent)] -z-10" />
      <div
        className="fixed inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(30,144,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(30,144,255,0.8) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/10">
        <Link href="/" className="flex items-center gap-2.5 group">
          <img
            src="/logo.png"
            alt="Survivor Sharks"
            className="h-8 w-8 object-contain drop-shadow-[0_0_8px_rgba(30,144,255,0.5)] group-hover:drop-shadow-[0_0_14px_rgba(30,144,255,0.7)] transition-all"
          />
          <span className="font-bebas text-xl tracking-widest text-primary hidden sm:block">
            Survivor Sharks
          </span>
        </Link>
        {!authLoading && !user && (
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <LogIn className="w-3.5 h-3.5 mr-1.5" />
                Sign in
              </Button>
            </Link>
          </div>
        )}
        {!authLoading && user && (
          <span className="text-xs text-muted-foreground">
            Signed in as <span className="text-primary font-medium">{user.username}</span>
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
        {fetchLoading ? (
          <div className="w-full max-w-lg space-y-6">
            <Skeleton className="h-8 w-32 mx-auto rounded-full" />
            <Skeleton className="h-14 w-3/4 mx-auto rounded-xl" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
            <div className="flex justify-center gap-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="w-[72px] h-[72px] rounded-xl" />)}
            </div>
            <Skeleton className="h-14 w-full rounded-xl mt-6" />
          </div>
        ) : fetchError ? (
          <div className="w-full max-w-md text-center space-y-5">
            <div className="w-16 h-16 rounded-full border border-destructive/30 bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7 text-destructive/70" />
            </div>
            <div>
              <h2 className="font-bebas text-3xl text-foreground tracking-wide mb-1">Invite Not Found</h2>
              <p className="text-muted-foreground text-sm">{fetchError}</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Code: <span className="font-mono text-primary/70">{inviteCode}</span></p>
            </div>
            <Link href="/">
              <Button variant="outline" className="border-border/40">Back to Home</Button>
            </Link>
          </div>
        ) : pool ? (
          step === 1 ? (
            <div className="w-full max-w-lg flex flex-col items-center gap-8">

              {/* Branding */}
              <div className="flex flex-col items-center">
                <img
                  src="/hero-banner-clean.jpg"
                  alt="Survivor Sharks"
                  className="w-full max-w-xs object-contain drop-shadow-[0_0_18px_rgba(30,144,255,0.5)]"
                />
              </div>

              {/* Welcome */}
              <p className="text-base text-muted-foreground text-center -mt-4">
                You've been invited to play! 🎉
              </p>

              {/* Sport badge */}
              <div className={cn(
                "inline-flex items-center gap-2.5 rounded-full border border-primary/30 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary backdrop-blur-sm",
                "bg-gradient-to-r from-primary/10 to-primary/5",
              )}>
                <span className="text-base leading-none">{sportMeta.emoji}</span>
                {sportMeta.label}
                {pool.season && <span className="text-primary/50 font-normal">· {pool.season}</span>}
              </div>

              {/* Pool name */}
              <div className="text-center">
                <h1 className="font-bebas text-5xl sm:text-6xl tracking-wide text-foreground leading-none">
                  {pool.name}
                </h1>
              </div>

              {/* Pool type pill */}
              <div className="flex items-center justify-center gap-2">
                <StatPill icon={<span className="text-sm leading-none">{sportMeta.emoji}</span>}>
                  <span>{POOL_TYPE_LABELS[pool.poolType] ?? pool.poolType}</span>
                </StatPill>
              </div>

              {/* WC countdown */}
              {isWc && !countdown.expired && (
                <div className="w-full flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
                    <span className="h-px w-8 bg-border/40" />
                    Kickoff countdown
                    <span className="h-px w-8 bg-border/40" />
                  </div>
                  <div className="flex items-start gap-3 sm:gap-4">
                    <CountdownUnit value={countdown.days} label="days" />
                    <span className="font-bebas text-3xl text-primary/30 mt-3 leading-none">:</span>
                    <CountdownUnit value={countdown.hours} label="hours" />
                    <span className="font-bebas text-3xl text-primary/30 mt-3 leading-none">:</span>
                    <CountdownUnit value={countdown.minutes} label="min" />
                    <span className="font-bebas text-3xl text-primary/30 mt-3 leading-none">:</span>
                    <CountdownUnit value={countdown.seconds} label="sec" />
                  </div>
                  <p className="text-[11px] text-muted-foreground/40 text-center">
                    June 11, 2026 · World Cup 2026 Group Stage Opens
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />

              {/* CTA section */}
              <div className="w-full space-y-3">
                {pool.maxEntries !== null && pool.playerCount >= pool.maxEntries ? (
                  <div className="w-full h-14 flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive/80 font-bebas text-xl tracking-widest">
                    This pool is full — no more spots available
                  </div>
                ) : (
                  <Button
                    className="w-full h-14 font-bebas text-2xl tracking-widest shadow-[0_0_24px_rgba(30,144,255,0.25)] hover:shadow-[0_0_32px_rgba(30,144,255,0.4)] transition-all"
                    onClick={() => setStep(2)}
                  >
                    View Details &amp; Join →
                  </Button>
                )}
              </div>

              {/* Invite code */}
              <p className="text-[10px] text-muted-foreground/25 tracking-[0.15em] font-mono uppercase">
                invite · {inviteCode}
              </p>
            </div>
          ) : (
            <div className="w-full max-w-md flex flex-col gap-6">

              {/* Back button */}
              <button
                onClick={() => setStep(1)}
                className="self-start text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                ← Back
              </button>

              {/* Pool name (context reminder) */}
              <h2 className="font-bebas text-3xl tracking-wide text-foreground leading-none text-center">
                {pool.name}
              </h2>

              {/* Entry fee */}
              <div className="text-center">
                {pool.entryFee && pool.entryFee > 0 ? (
                  <p className="text-4xl font-bold text-foreground">
                    Buy-in: ${pool.entryFee}
                  </p>
                ) : (
                  <p className="text-4xl font-bold text-primary">
                    Free Entry
                  </p>
                )}
              </div>

              {/* Progressive pool notice */}
              {pool.prizeMode === "pct" && (
                <p className="text-sm text-muted-foreground text-center">
                  🏆 Progressive Pool — prize pot grows with every player who joins
                </p>
              )}

              {/* Prize structure */}
              <PrizeDisplay
                variant="join-invite"
                prizeMode={pool.prizeMode}
                entryFee={pool.entryFee}
                prizeStructure={pool.prizeStructure}
                prizePot={pool.prizePot}
                maxEntries={pool.maxEntries}
                actualEntries={pool.playerCount}
              />

              {/* Player count */}
              <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <Users className="w-4 h-4 text-primary/70" />
                <span>
                  <span className="text-foreground font-semibold">{pool.playerCount}</span>
                  {" "}{pool.playerCount === 1 ? "player" : "players"} joined
                </span>
              </div>

              {/* Min entries notice */}
              {pool.minEntries !== null && pool.minEntries !== undefined && (
                <p className="text-xs text-muted-foreground/70 text-center">
                  ⚠️ Minimum {pool.minEntries} players required for this pool to run
                </p>
              )}

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />

              {/* Joining as */}
              {user && (
                <p className="text-sm text-muted-foreground text-center">
                  Joining as{" "}
                  <span className="text-primary font-medium">{user.username}</span>
                </p>
              )}

              {/* CTA */}
              <div className="w-full space-y-3">
                {pool.maxEntries !== null && pool.playerCount >= pool.maxEntries ? (
                  <div className="w-full h-14 flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive/80 font-bebas text-xl tracking-widest">
                    This pool is full — no more spots available
                  </div>
                ) : user ? (
                  <Button
                    className="w-full h-14 font-bebas text-2xl tracking-widest shadow-[0_0_24px_rgba(30,144,255,0.25)] hover:shadow-[0_0_32px_rgba(30,144,255,0.4)] transition-all"
                    onClick={handleJoin}
                    disabled={joinPool.isPending}
                  >
                    {joinPool.isPending ? "Joining…" : "Join This Pool"}
                  </Button>
                ) : (
                  <>
                    <Button
                      className="w-full h-14 font-bebas text-2xl tracking-widest shadow-[0_0_24px_rgba(30,144,255,0.25)] hover:shadow-[0_0_32px_rgba(30,144,255,0.4)] transition-all"
                      onClick={handleJoin}
                    >
                      Join This Pool
                    </Button>
                    <button
                      className="w-full text-sm text-muted-foreground hover:text-foreground text-center transition-colors"
                      onClick={() => {
                        localStorage.setItem("pending_invite_code", inviteCode);
                        setLocation("/login");
                      }}
                    >
                      Sign in instead
                    </button>
                  </>
                )}
              </div>

              {/* Invite code */}
              <p className="text-[10px] text-muted-foreground/25 tracking-[0.15em] font-mono uppercase text-center">
                invite · {inviteCode}
              </p>
            </div>
          )
        ) : null}
      </main>
    </div>
  );
}
