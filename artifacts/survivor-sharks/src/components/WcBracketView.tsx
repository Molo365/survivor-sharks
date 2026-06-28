import { useState, useMemo } from "react";
import {
  useGetWcBracket,
  useSubmitWcBracketPicks,
  useGetWcBracketLeaderboard,
  getGetWcBracketQueryKey,
  getGetWcBracketLeaderboardQueryKey,
} from "@workspace/api-client-react";
import type { WcBracketMatch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  X,
  Lock,
  Clock,
  Activity,
  Target,
  Loader2,
} from "lucide-react";

// ── ESPN country flag CDN slug map ────────────────────────────────────────────

const TEAM_FLAG_SLUG: Record<string, string> = {
  Algeria: "alg",
  Argentina: "arg",
  Australia: "aus",
  Austria: "aut",
  Belgium: "bel",
  "Bosnia & Herzegovina": "bih",
  Brazil: "bra",
  Canada: "can",
  "Cape Verde": "cpv",
  Colombia: "col",
  Croatia: "cro",
  "DR Congo": "rdc",
  Ecuador: "ecu",
  Egypt: "egy",
  England: "eng",
  France: "fra",
  Germany: "ger",
  Ghana: "gha",
  "Ivory Coast": "civ",
  Japan: "jpn",
  Mexico: "mex",
  Morocco: "mar",
  Netherlands: "ned",
  Norway: "nor",
  Paraguay: "par",
  Portugal: "por",
  Senegal: "sen",
  "South Africa": "rsa",
  Spain: "esp",
  Sweden: "swe",
  Switzerland: "sui",
  USA: "usa",
};

function teamLogoUrl(name: string, apiLogo?: string | null): string | null {
  if (apiLogo) return apiLogo;
  const slug = TEAM_FLAG_SLUG[name];
  if (!slug) return null;
  return `https://a.espncdn.com/i/teamlogos/countries/500/${slug}.png`;
}

function teamAbbr(name: string): string {
  const slug = TEAM_FLAG_SLUG[name];
  return slug ? slug.toUpperCase() : name.slice(0, 3).toUpperCase();
}

// ── Date formatting ───────────────────────────────────────────────────────────

function formatKickoff(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateHeading(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return dateStr;
  }
}

// ── PickBadge ─────────────────────────────────────────────────────────────────

function PickBadge({ isCorrect }: { isCorrect: boolean | null }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-1.5 py-0.5",
        isCorrect === true
          ? "text-green-400 bg-green-500/15"
          : isCorrect === false
            ? "text-red-400 bg-red-500/15"
            : "text-primary/70 bg-primary/10",
      )}
    >
      {isCorrect === true ? (
        <Check className="w-2.5 h-2.5" />
      ) : isCorrect === false ? (
        <X className="w-2.5 h-2.5" />
      ) : null}
      {isCorrect === true
        ? "Correct · My Pick"
        : isCorrect === false
          ? "Wrong · My Pick"
          : "My Pick"}
    </div>
  );
}

// ── Team button class helper ──────────────────────────────────────────────────

function teamBtnClass(isPicked: boolean, isCorrect: boolean | null): string {
  if (isPicked && isCorrect === true)
    return "border-green-500 bg-green-500/10 ring-2 ring-green-500/40";
  if (isPicked && isCorrect === false)
    return "border-destructive bg-destructive/10 ring-2 ring-destructive/30";
  if (isPicked) return "border-primary bg-primary/10 ring-2 ring-primary/40";
  return "border-border/40 bg-card/60 hover:border-border";
}

// ── TeamBtn ───────────────────────────────────────────────────────────────────

function TeamBtn({
  name,
  logoUrl,
  abbr,
  side,
  isPicked,
  isCorrect,
  isLocked,
  isSubmitting,
  onClick,
}: {
  name: string;
  logoUrl: string | null;
  abbr: string;
  side: "left" | "right";
  isPicked: boolean;
  isCorrect: boolean | null;
  isLocked: boolean;
  isSubmitting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={isLocked || isSubmitting}
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2 transition-all select-none",
        isLocked
          ? "cursor-default"
          : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
        teamBtnClass(isPicked, isPicked ? isCorrect : null),
        side === "right" ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Flag in white circle */}
      <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted/40 flex items-center justify-center">
            <span className="font-bebas text-xs text-muted-foreground">
              {abbr}
            </span>
          </div>
        )}
      </div>

      {/* Team info */}
      <div
        className={cn(
          "flex-1 flex flex-col gap-0.5 min-w-0",
          side === "right" ? "items-end text-right" : "items-start text-left",
        )}
      >
        <span
          className={cn(
            "font-bebas tracking-wide text-base sm:text-xl leading-tight",
            isPicked ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {name}
        </span>
        {isPicked && <PickBadge isCorrect={isCorrect} />}
      </div>
    </button>
  );
}

// ── BracketMatchCard ──────────────────────────────────────────────────────────

function BracketMatchCard({
  match,
  submittingId,
  onPick,
}: {
  match: WcBracketMatch;
  submittingId: string | null;
  onPick: (espnEventId: string, pickedTeam: string) => void;
}) {
  const isSubmitting = submittingId === match.espnEventId;
  const picked1 = match.pickedTeam === match.team1;
  const picked2 = match.pickedTeam === match.team2;
  const isFinal = match.isCompleted;

  const logo1 = teamLogoUrl(match.team1, match.team1Logo);
  const logo2 = teamLogoUrl(match.team2, match.team2Logo);
  const abbr1 = teamAbbr(match.team1);
  const abbr2 = teamAbbr(match.team2);

  return (
    <div
      className={cn(
        "shark-card rounded-xl border overflow-hidden relative",
        isFinal ? "border-muted/40" : "border-border/40",
      )}
    >
      {/* Submitting overlay */}
      {isSubmitting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 rounded-xl">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Match slot label */}
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
          Match {match.matchSlot}
        </span>
      </div>

      <div className="flex items-stretch gap-0 pt-4">
        {/* Team 1 (left) */}
        <TeamBtn
          name={match.team1}
          logoUrl={logo1}
          abbr={abbr1}
          side="left"
          isPicked={picked1}
          isCorrect={picked1 ? match.isCorrect : null}
          isLocked={match.isLocked}
          isSubmitting={isSubmitting}
          onClick={() => onPick(match.espnEventId, match.team1)}
        />

        {/* Center column */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[68px] sm:px-3 sm:min-w-[80px] shrink-0">
          {isFinal && match.result ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
                Full Time
              </span>
              {match.result.winType !== "normal" && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-yellow-400/80 leading-none">
                  {match.result.winType === "aet" ? "AET" : "Pens"}
                </span>
              )}
              <span className="font-bebas text-sm text-accent leading-none mt-0.5 text-center">
                {match.result.winner}
              </span>
            </>
          ) : match.isLocked ? (
            <>
              <Lock className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 leading-none">
                Locked
              </span>
            </>
          ) : (
            <>
              <span className="font-bebas text-xs text-muted-foreground/70 tracking-widest uppercase">
                vs
              </span>
              <div className="flex flex-col items-center gap-0.5 mt-0.5">
                <Clock className="w-3 h-3 text-primary/60 shrink-0" />
                <span className="text-[10px] text-muted-foreground leading-tight font-semibold whitespace-nowrap text-center">
                  {formatKickoff(match.matchDate)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Team 2 (right) */}
        <TeamBtn
          name={match.team2}
          logoUrl={logo2}
          abbr={abbr2}
          side="right"
          isPicked={picked2}
          isCorrect={picked2 ? match.isCorrect : null}
          isLocked={match.isLocked}
          isSubmitting={isSubmitting}
          onClick={() => onPick(match.espnEventId, match.team2)}
        />
      </div>
    </div>
  );
}

// ── WcBracketLeaderboard ──────────────────────────────────────────────────────

const RANK_STYLES = [
  { icon: "🥇", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { icon: "🥈", bg: "bg-slate-400/10 border-slate-400/30" },
  { icon: "🥉", bg: "bg-orange-600/10 border-orange-600/30" },
];

function WcBracketLeaderboard({ poolId }: { poolId: number }) {
  const { data, isLoading } = useGetWcBracketLeaderboard(poolId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="font-bebas text-2xl tracking-wider mb-1">No picks yet</p>
        <p className="text-sm">
          Leaderboard will populate as members make picks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((entry) => {
        const rankStyle = RANK_STYLES[entry.rank - 1];
        const pct =
          entry.total > 0
            ? Math.round((entry.correct / entry.total) * 100)
            : 0;
        return (
          <div
            key={entry.userId}
            className={cn(
              "flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors",
              rankStyle ? rankStyle.bg : "bg-card border-border/40",
            )}
          >
            {/* Rank */}
            <div className="w-8 text-center shrink-0">
              {rankStyle ? (
                <span className="text-xl">{rankStyle.icon}</span>
              ) : (
                <span className="font-bebas text-xl text-muted-foreground/50">
                  {entry.rank}
                </span>
              )}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="font-bebas text-lg tracking-wide leading-tight truncate">
                {entry.displayName || entry.username}
              </p>
              {entry.displayName && (
                <p className="text-xs text-muted-foreground truncate">
                  @{entry.username}
                </p>
              )}
            </div>

            {/* Score */}
            <div className="text-right shrink-0">
              <div className="font-bebas text-2xl leading-none text-accent">
                {entry.correct}
                <span className="text-base text-muted-foreground/60">
                  {" "}
                  / {entry.total}
                </span>
              </div>
              {entry.total > 0 && (
                <div className="text-[10px] text-muted-foreground/60 font-semibold">
                  {pct}% correct
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WcBracketView (main export) ───────────────────────────────────────────────

export function WcBracketView({ poolId }: { poolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { data: matches, isLoading } = useGetWcBracket(poolId, {
    query: { queryKey: getGetWcBracketQueryKey(poolId) },
  });

  const { mutate } = useSubmitWcBracketPicks({
    mutation: {
      onSuccess: (result) => {
        setSubmittingId(null);
        if (result.rejectedEventIds?.length) {
          toast({
            title: "Pick rejected — match locked",
            description: "That match has already kicked off.",
            variant: "destructive",
          });
        }
        void queryClient.invalidateQueries({
          queryKey: getGetWcBracketQueryKey(poolId),
        });
        void queryClient.invalidateQueries({
          queryKey: getGetWcBracketLeaderboardQueryKey(poolId),
        });
      },
      onError: () => {
        setSubmittingId(null);
        toast({
          title: "Error saving pick",
          description: "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  function handlePick(espnEventId: string, pickedTeam: string) {
    setSubmittingId(espnEventId);
    mutate({ poolId, data: { picks: [{ espnEventId, pickedTeam }] } });
  }

  // Group by calendar date (first 10 chars of ISO matchDate)
  const grouped = useMemo(() => {
    if (!matches) return [];
    const map = new Map<string, WcBracketMatch[]>();
    for (const m of matches) {
      const day = m.matchDate.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  // Summary stats
  const { totalPicked, totalCorrect } = useMemo(() => {
    if (!matches) return { totalPicked: 0, totalCorrect: 0 };
    return {
      totalPicked: matches.filter((m) => m.pickedTeam).length,
      totalCorrect: matches.filter((m) => m.isCorrect === true).length,
    };
  }, [matches]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="matches" className="w-full">
      {/* Tab nav */}
      <div className="relative">
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
            <TabsTrigger
              value="matches"
              className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-400 flex gap-2"
            >
              <Target className="w-4 h-4 md:w-5 md:h-5" /> Matches
            </TabsTrigger>
            <TabsTrigger
              value="leaderboard"
              className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2"
            >
              <Activity className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
      </div>

      <div className="mt-8">
        {/* Matches tab */}
        <TabsContent value="matches" className="m-0 focus-visible:outline-none">
          {/* Summary bar */}
          {matches && matches.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="bg-card border border-border/50 px-4 py-2.5 rounded-lg text-center">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">
                  Picks Made
                </div>
                <div className="font-bebas text-2xl text-primary leading-none">
                  {totalPicked}
                  <span className="text-base text-muted-foreground/60">
                    {" "}
                    / {matches.length}
                  </span>
                </div>
              </div>
              {totalCorrect > 0 && (
                <div className="bg-green-500/10 border border-green-500/20 px-4 py-2.5 rounded-lg text-center">
                  <div className="text-[10px] text-green-400/80 uppercase font-bold tracking-wider mb-0.5">
                    Correct
                  </div>
                  <div className="font-bebas text-2xl text-green-400 leading-none">
                    {totalCorrect}
                    <span className="text-base text-green-400/50">
                      {" "}
                      / {totalPicked}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Date-grouped match cards */}
          <div className="space-y-8">
            {grouped.map(([day, dayMatches]) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-bebas text-xl tracking-wide text-muted-foreground shrink-0">
                    {formatDateHeading(day)}
                  </h3>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dayMatches.map((match) => (
                    <BracketMatchCard
                      key={match.espnEventId}
                      match={match}
                      submittingId={submittingId}
                      onPick={handlePick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Leaderboard tab */}
        <TabsContent
          value="leaderboard"
          className="m-0 focus-visible:outline-none"
        >
          <WcBracketLeaderboard poolId={poolId} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
