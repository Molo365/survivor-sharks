import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useGetWcBracket,
  useSubmitWcBracketPicks,
  useGetWcBracketLeaderboard,
  useGetWcBracketMemberPicks,
  useGetWcBracketTree,
  useUpdatePool,
  getGetWcBracketQueryKey,
  getGetWcBracketLeaderboardQueryKey,
  getGetWcBracketMemberPicksQueryKey,
  getGetPoolQueryKey,
} from "@workspace/api-client-react";
import type { WcBracketMatch, WcBracketLeaderboardEntry, BracketTreeSlot } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CancelPoolButton } from "@/components/CancelPoolButton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  X,
  Lock,
  Clock,
  Activity,
  Target,
  Loader2,
  Save,
  Copy,
  ShieldAlert,
  Settings2,
  Trophy,
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

function PickBadge({
  isCorrect,
  isPending,
}: {
  isCorrect: boolean | null;
  isPending?: boolean;
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-1.5 py-0.5 text-amber-400 bg-amber-500/15">
        Unsaved
      </div>
    );
  }
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

function teamBtnClass(
  isPicked: boolean,
  isPending: boolean,
  isCorrect: boolean | null,
): string {
  if (isPending) return "border-amber-400 bg-amber-500/10 ring-2 ring-amber-400/40";
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
  isPending,
  isCorrect,
  isLocked,
  onClick,
}: {
  name: string;
  logoUrl: string | null;
  abbr: string;
  side: "left" | "right";
  isPicked: boolean;
  isPending: boolean;
  isCorrect: boolean | null;
  isLocked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={isLocked}
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2 transition-all select-none",
        isLocked
          ? "cursor-default"
          : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
        teamBtnClass(isPicked, isPending, isPicked && !isPending ? isCorrect : null),
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
            isPicked || isPending ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {name}
        </span>
        {isPending && <PickBadge isCorrect={null} isPending />}
        {isPicked && !isPending && <PickBadge isCorrect={isCorrect} />}
      </div>
    </button>
  );
}

// ── BracketMatchCard ──────────────────────────────────────────────────────────

function BracketMatchCard({
  match,
  pendingTeam,
  onPick,
}: {
  match: WcBracketMatch;
  pendingTeam: string | null;
  onPick: (espnEventId: string, pickedTeam: string) => void;
}) {
  const effectivePick = pendingTeam ?? match.pickedTeam;
  const picked1 = effectivePick === match.team1;
  const picked2 = effectivePick === match.team2;
  const pending1 = pendingTeam === match.team1;
  const pending2 = pendingTeam === match.team2;
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
          isPicked={picked1 && !pending1}
          isPending={pending1}
          isCorrect={picked1 && !pending1 ? match.isCorrect : null}
          isLocked={match.isLocked}
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
          isPicked={picked2 && !pending2}
          isPending={pending2}
          isCorrect={picked2 && !pending2 ? match.isCorrect : null}
          isLocked={match.isLocked}
          onClick={() => onPick(match.espnEventId, match.team2)}
        />
      </div>
    </div>
  );
}

// ── ReadOnlyMatchCard (for member picks modal) ────────────────────────────────

function ReadOnlyMatchCard({ match }: { match: WcBracketMatch }) {
  const isFinal = match.isCompleted;
  const logo1 = teamLogoUrl(match.team1, match.team1Logo);
  const logo2 = teamLogoUrl(match.team2, match.team2Logo);

  function teamRowClass(team: string) {
    const isPicked = match.pickedTeam === team;
    if (!isPicked) return "border-border/20 bg-background/30";
    if (match.isCorrect === true) return "border-green-500/40 bg-green-500/10";
    if (match.isCorrect === false) return "border-destructive/40 bg-destructive/10";
    return "border-primary/40 bg-primary/10";
  }

  function TeamRow({ name, logoUrl }: { name: string; logoUrl: string | null }) {
    const isPicked = match.pickedTeam === name;
    const abbr = teamAbbr(name);
    return (
      <div className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 border", teamRowClass(name))}>
        <div className="shrink-0 rounded-full bg-white/90 p-1 shadow-sm">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={name}
              className="w-6 h-6 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-muted/40 flex items-center justify-center">
              <span className="font-bebas text-[8px] text-muted-foreground">{abbr}</span>
            </div>
          )}
        </div>
        <span className={cn("flex-1 font-bebas tracking-wide text-sm leading-tight",
          isPicked ? "text-foreground" : "text-muted-foreground/70"
        )}>
          {name}
        </span>
        {isPicked && (
          isFinal ? (
            match.isCorrect === true ? (
              <Check className="w-4 h-4 text-green-400 shrink-0" />
            ) : match.isCorrect === false ? (
              <X className="w-4 h-4 text-destructive shrink-0" />
            ) : null
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 shrink-0">Pick</span>
          )
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border p-3 bg-card space-y-1.5",
      isFinal ? "border-muted/40" : "border-border/40",
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
          Match {match.matchSlot}
        </span>
        {isFinal && match.result ? (
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30">
            FT · {match.result.winner}
          </span>
        ) : match.isLocked ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
            <Lock className="w-2.5 h-2.5" /> Locked
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground/50">
            {formatKickoff(match.matchDate)}
          </span>
        )}
      </div>
      <TeamRow name={match.team1} logoUrl={logo1} />
      <TeamRow name={match.team2} logoUrl={logo2} />
      {!match.pickedTeam && (
        <p className="text-[10px] text-muted-foreground/40 text-center italic pt-0.5">No pick</p>
      )}
    </div>
  );
}

// ── WcBracketMemberPicksModal ─────────────────────────────────────────────────

function WcBracketMemberPicksModal({
  poolId,
  userId,
  displayName,
  onClose,
}: {
  poolId: number;
  userId: number;
  displayName: string;
  onClose: () => void;
}) {
  const { data: matches, isLoading } = useGetWcBracketMemberPicks(poolId, userId, {
    query: { queryKey: getGetWcBracketMemberPicksQueryKey(poolId, userId) },
  });

  const totalPicked = matches?.filter((m) => m.pickedTeam).length ?? 0;
  const totalCorrect = matches?.filter((m) => m.isCorrect === true).length ?? 0;
  const anyGraded = matches?.some((m) => m.isCorrect !== null) ?? false;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background border-border/60 p-0">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <div>
            <DialogTitle className="font-bebas text-2xl tracking-wider text-foreground leading-none">
              <span className="text-yellow-400">{displayName}</span>
              <span className="text-muted-foreground">'s Picks</span>
            </DialogTitle>
            {!isLoading && matches && (
              <p className="text-xs text-muted-foreground mt-1">
                {totalPicked} of {matches.length} matches picked
                {anyGraded && ` · ${totalCorrect} correct`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="px-6 pb-6 pt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 16 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : !matches || matches.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No bracket data found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {matches.map((match) => (
                <ReadOnlyMatchCard key={match.espnEventId} match={match} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── WcBracketLeaderboard ──────────────────────────────────────────────────────

const RANK_STYLES = [
  { icon: "🥇", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { icon: "🥈", bg: "bg-slate-400/10 border-slate-400/30" },
  { icon: "🥉", bg: "bg-orange-600/10 border-orange-600/30" },
];

function WcBracketLeaderboard({
  poolId,
  onSelectPlayer,
}: {
  poolId: number;
  onSelectPlayer: (entry: WcBracketLeaderboardEntry) => void;
}) {
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
      <p className="text-xs text-muted-foreground/60 text-right mb-1">
        Tap a player to see their picks
      </p>
      {data.map((entry) => {
        const rankStyle = RANK_STYLES[entry.rank - 1];
        const pct =
          entry.total > 0
            ? Math.round((entry.correct / entry.total) * 100)
            : 0;
        return (
          <button
            key={entry.userId}
            type="button"
            onClick={() => onSelectPlayer(entry)}
            className={cn(
              "w-full flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors text-left",
              "hover:brightness-110 active:scale-[0.99] cursor-pointer",
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
          </button>
        );
      })}
    </div>
  );
}

// ── BracketSlotBox ─────────────────────────────────────────────────────────────
// Compact 2-row match card for the bracket tree view.

function BracketSlotBox({ slot }: { slot: BracketTreeSlot }) {
  function TeamRow({ name, logoUrl }: { name: string; logoUrl: string | null }) {
    const isTBD = name === "TBD";
    const isWinner = slot.isCompleted && slot.winner === name;
    const isPicked = !isTBD && slot.pickedTeam === name;
    const isCorrectPick = isPicked && slot.isCorrect === true;
    const isWrongPick = isPicked && slot.isCorrect === false;
    const slug = TEAM_FLAG_SLUG[name];
    const flagSrc = logoUrl ?? (slug ? `https://a.espncdn.com/i/teamlogos/countries/500/${slug}.png` : null);
    const abbr = slug ? slug.toUpperCase() : name.slice(0, 3).toUpperCase();

    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          isWinner && "bg-yellow-500/10",
          isCorrectPick && "bg-green-500/10",
          isWrongPick && "bg-destructive/10",
          isPicked && !isWinner && !isCorrectPick && !isWrongPick && "bg-primary/10",
        )}
      >
        <div className="w-[28px] h-[28px] rounded-full bg-white/90 shrink-0 overflow-hidden flex items-center justify-center">
          {flagSrc && !isTBD ? (
            <img
              src={flagSrc}
              alt={name}
              className="w-full h-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground">?</span>
          )}
        </div>
        <span
          className={cn(
            "font-bebas text-[15px] tracking-wide leading-none flex-1 min-w-0 truncate",
            isTBD ? "text-muted-foreground/25" :
              isWinner ? "text-yellow-400" :
              isPicked ? "text-foreground" : "text-muted-foreground/70",
          )}
        >
          {isTBD ? "TBD" : abbr}
        </span>
        {isCorrectPick && <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        {isWrongPick && <X className="w-3.5 h-3.5 text-destructive shrink-0" />}
        {isPicked && !isCorrectPick && !isWrongPick && (
          <div className="w-2 h-2 rounded-full bg-primary/60 shrink-0" />
        )}
        {isWinner && !isPicked && (
          <div className="w-2 h-2 rounded-full bg-yellow-400/60 shrink-0" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden bg-card/80 shrink-0",
        slot.isCompleted ? "border-muted/40" : "border-border/30",
      )}
      style={{ width: 158 }}
    >
      <TeamRow name={slot.team1} logoUrl={slot.team1Logo ?? null} />
      <div className="h-px bg-border/20" />
      <TeamRow name={slot.team2} logoUrl={slot.team2Logo ?? null} />
    </div>
  );
}

// ── BracketTreeTab ──────────────────────────────────────────────────────────────
// Full 16-team knockout bracket visualized as a tree (R32 → R16 → QF → SF → Final).
// Left half flows right-to-center; right half flows left-to-center.

function BracketTreeTab({ poolId }: { poolId: number }) {
  const { data: slots, isLoading } = useGetWcBracketTree(poolId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading bracket…
      </div>
    );
  }
  if (!slots || slots.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-bebas text-2xl tracking-wider text-muted-foreground">Bracket unavailable</p>
      </div>
    );
  }

  const byKey = (round: string, side: string) =>
    slots
      .filter((s) => s.round === round && s.side === side)
      .sort((a, b) => a.bracketPos - b.bracketPos);

  const r32L  = byKey("round_of_32",    "left");
  const r32R  = byKey("round_of_32",    "right");
  const r16L  = byKey("round_of_16",    "left");
  const r16R  = byKey("round_of_16",    "right");
  const qfL   = byKey("quarterfinals",  "left");
  const qfR   = byKey("quarterfinals",  "right");
  const sfL   = byKey("semifinals",     "left");
  const sfR   = byKey("semifinals",     "right");
  const final = slots.find((s) => s.round === "final");

  // Layout constants (px)
  const UNIT     = 110;  // height of each R32 logical slot
  const H        = 880;  // total bracket height = 8 * UNIT
  const CONN_W   = 20;   // bracket connector notch width
  const ENTRY_W  = 12;   // horizontal entry arm on parent column
  const BOX_W    = 158;  // width of BracketSlotBox (must match style={{ width: 158 }})
  const SF_CONN  = 40;   // width of the SF → Final horizontal connector

  const LINE = "1px solid rgba(255,255,255,0.1)";

  // RoundCol renders a flex-column of slots, each unitCount*UNIT tall.
  // entryOn adds a short horizontal arm on the specified side of each slot box.
  function RoundCol({
    matches,
    unitCount,
    entryOn = "none",
  }: {
    matches: BracketTreeSlot[];
    unitCount: number;
    entryOn?: "left" | "right" | "none";
  }) {
    const slotH = unitCount * UNIT;
    return (
      <div style={{ height: H, flexShrink: 0 }}>
        {matches.map((slot) => (
          <div
            key={`${slot.round}-${slot.side}-${slot.bracketPos}`}
            style={{ height: slotH, display: "flex", alignItems: "center" }}
          >
            {entryOn === "left" && (
              <div style={{ width: ENTRY_W, height: 1, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            )}
            <BracketSlotBox slot={slot} />
            {entryOn === "right" && (
              <div style={{ width: ENTRY_W, height: 1, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Conn renders a bracket notch connecting 2 child slots (outer round) to 1 parent slot (inner round).
  // parentCount = number of parent slots (= number of notches).
  // childUnitCount = UNIT-multiples per child slot.
  // side = "left"  → spine on right edge (children are on the left, parent on the right).
  //      = "right" → spine on left edge  (parent is on the left, children on the right).
  function Conn({
    parentCount,
    childUnitCount,
    side,
  }: {
    parentCount: number;
    childUnitCount: number;
    side: "left" | "right";
  }) {
    const childH  = childUnitCount * UNIT;
    const parentH = 2 * childH;
    const spacer  = childH / 2;
    const armH    = childH / 2;
    const spineBorder = side === "left" ? { borderRight: LINE } : { borderLeft: LINE };

    return (
      <div style={{ height: H, width: CONN_W, flexShrink: 0 }}>
        {Array.from({ length: parentCount }, (_, i) => (
          <div key={i} style={{ height: parentH }}>
            <div style={{ height: spacer }} />
            <div style={{ height: armH, borderTop: LINE, ...spineBorder }} />
            <div style={{ height: armH, borderBottom: LINE, ...spineBorder }} />
            <div style={{ height: spacer }} />
          </div>
        ))}
      </div>
    );
  }

  // Column header labels positioned above each round column.
  const headerCols = [
    { label: "R32",   w: BOX_W },
    { label: "",      w: CONN_W },
    { label: "R16",   w: ENTRY_W + BOX_W },
    { label: "",      w: CONN_W },
    { label: "QF",    w: ENTRY_W + BOX_W },
    { label: "",      w: CONN_W },
    { label: "SF",    w: ENTRY_W + BOX_W },
    { label: "",      w: SF_CONN },
    { label: "Final", w: BOX_W + 28 },
    { label: "",      w: SF_CONN },
    { label: "SF",    w: BOX_W + ENTRY_W },
    { label: "",      w: CONN_W },
    { label: "QF",    w: BOX_W + ENTRY_W },
    { label: "",      w: CONN_W },
    { label: "R16",   w: BOX_W + ENTRY_W },
    { label: "",      w: CONN_W },
    { label: "R32",   w: BOX_W },
  ];

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5 text-[11px] text-muted-foreground">
        <span className="font-bebas text-sm tracking-wide text-foreground/50 mr-1">Legend:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60" /> My pick
        </div>
        <div className="flex items-center gap-1.5">
          <Check className="w-3 h-3 text-green-400" /> Correct
        </div>
        <div className="flex items-center gap-1.5">
          <X className="w-3 h-3 text-destructive" /> Wrong
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/60" /> Advanced
        </div>
      </div>

      {/* Round headers */}
      <div className="overflow-x-hidden mb-1.5">
        <div style={{ display: "inline-flex" }}>
          {headerCols.map(({ label, w }, i) => (
            <div
              key={i}
              style={{ width: w, flexShrink: 0, textAlign: "center" }}
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable bracket tree */}
      <div className="overflow-x-auto pb-6 -mx-4 px-4">
        <div style={{ display: "inline-flex", alignItems: "stretch", userSelect: "none" }}>

          {/* ── LEFT HALF: R32 → R16 → QF → SF ──────────────────────────── */}
          <RoundCol matches={r32L} unitCount={1} />
          <Conn parentCount={4} childUnitCount={1} side="left" />
          <RoundCol matches={r16L} unitCount={2} entryOn="left" />
          <Conn parentCount={2} childUnitCount={2} side="left" />
          <RoundCol matches={qfL}  unitCount={4} entryOn="left" />
          <Conn parentCount={1} childUnitCount={4} side="left" />
          <RoundCol matches={sfL}  unitCount={8} entryOn="left" />

          {/* SF-left → Final connector (horizontal arm at center height) */}
          <div style={{ height: H, width: SF_CONN, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, borderBottom: LINE, borderRight: LINE }} />
            <div style={{ flex: 1 }} />
          </div>

          {/* ── CENTER: Final + Champion ───────────────────────────────────── */}
          <div
            style={{
              height: H,
              width: BOX_W + 28,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">
                🏆 Final
              </p>
              {final ? (
                <BracketSlotBox slot={final} />
              ) : (
                <div
                  className="rounded-lg border border-dashed border-border/20 bg-card/30 flex items-center justify-center"
                  style={{ width: BOX_W, height: 70 }}
                >
                  <span className="text-[9px] text-muted-foreground/25 font-bold uppercase tracking-widest">
                    TBD
                  </span>
                </div>
              )}
            </div>
            {final?.winner && (
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-500/70 mb-1">
                  Champion
                </p>
                <p className="font-bebas text-2xl tracking-wider text-yellow-400">{final.winner}</p>
              </div>
            )}
          </div>

          {/* Final → SF-right connector */}
          <div style={{ height: H, width: SF_CONN, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1 }} />
            <div style={{ flex: 1, borderTop: LINE, borderLeft: LINE }} />
          </div>

          {/* ── RIGHT HALF: SF → QF → R16 → R32 ─────────────────────────── */}
          <RoundCol matches={sfR}  unitCount={8} entryOn="right" />
          <Conn parentCount={1} childUnitCount={4} side="right" />
          <RoundCol matches={qfR}  unitCount={4} entryOn="right" />
          <Conn parentCount={2} childUnitCount={2} side="right" />
          <RoundCol matches={r16R} unitCount={2} entryOn="right" />
          <Conn parentCount={4} childUnitCount={1} side="right" />
          <RoundCol matches={r32R} unitCount={1} />

        </div>
      </div>
    </div>
  );
}

// ── WcBracketView (main export) ───────────────────────────────────────────────

export function WcBracketView({
  poolId,
  isCommissioner = false,
  inviteCode,
  poolName,
  poolDescription,
}: {
  poolId: number;
  isCommissioner?: boolean;
  inviteCode?: string;
  poolName?: string;
  poolDescription?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Pending picks: staged but not yet saved to the server
  const [pendingPicks, setPendingPicks] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [isSaving, setIsSaving] = useState(false);

  // Selected player for the picks modal (leaderboard click)
  const [selectedPlayer, setSelectedPlayer] =
    useState<WcBracketLeaderboardEntry | null>(null);

  // Commissioner settings form
  const [commName, setCommName] = useState(poolName ?? "");
  const [commDesc, setCommDesc] = useState(poolDescription ?? "");
  const updatePool = useUpdatePool();

  useEffect(() => {
    setCommName(poolName ?? "");
    setCommDesc(poolDescription ?? "");
  }, [poolName, poolDescription]);

  const handleCommissionerSave = () => {
    updatePool.mutate(
      { poolId, data: { name: commName, description: commDesc } } as any,
      {
        onSuccess: () => {
          toast({ title: "Settings saved", description: "Pool configuration updated." });
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Failed to save", description: err?.message || "An error occurred" });
        },
      }
    );
  };

  const copyInvite = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      toast({ title: "Invite code copied!" });
    }
  };

  const copyInviteLink = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`);
      toast({ title: "Invite link copied!", description: "Share it with anyone to let them join." });
    }
  };

  const { data: matches, isLoading } = useGetWcBracket(poolId, {
    query: { queryKey: getGetWcBracketQueryKey(poolId) },
  });

  const { mutate } = useSubmitWcBracketPicks({
    mutation: {
      onSuccess: (result, variables) => {
        setIsSaving(false);

        // Clear only the picks we just saved
        const savedIds = new Set(
          variables.data.picks.map((p) => p.espnEventId),
        );
        setPendingPicks((prev) => {
          const next = new Map(prev);
          for (const id of savedIds) next.delete(id);
          return next;
        });

        if (result.rejectedEventIds?.length) {
          const savedCount = result.saved;
          toast({
            title:
              savedCount > 0
                ? `${savedCount} pick${savedCount !== 1 ? "s" : ""} saved`
                : "No picks saved",
            description: `${result.rejectedEventIds.length} match${result.rejectedEventIds.length !== 1 ? "es" : ""} already kicked off and could not be updated.`,
            variant: savedCount > 0 ? "default" : "destructive",
          });
        } else {
          const n = result.saved;
          toast({
            title: `${n} pick${n !== 1 ? "s" : ""} saved!`,
            description: "Your selections have been recorded.",
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
        setIsSaving(false);
        toast({
          title: "Error saving picks",
          description: "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  // Click on a team: stage or update a pending pick
  const handlePick = useCallback(
    (espnEventId: string, pickedTeam: string) => {
      const match = matches?.find((m) => m.espnEventId === espnEventId);
      if (!match || match.isLocked) return;

      setPendingPicks((prev) => {
        const next = new Map(prev);
        const hasPending = next.has(espnEventId);
        const currentPending = next.get(espnEventId);

        if (hasPending) {
          if (currentPending === pickedTeam || pickedTeam === match.pickedTeam) {
            // Clicking the pending pick OR the saved pick → revert to server state
            next.delete(espnEventId);
          } else {
            // Switch to a different pending pick
            next.set(espnEventId, pickedTeam);
          }
        } else {
          if (pickedTeam !== (match.pickedTeam ?? "")) {
            // Stage a pick that differs from saved
            next.set(espnEventId, pickedTeam);
          }
          // else: clicking the already-saved pick → no-op
        }
        return next;
      });
    },
    [matches],
  );

  // Submit all pending picks at once
  function handleSave() {
    if (pendingPicks.size === 0 || isSaving) return;
    setIsSaving(true);
    const picks = [...pendingPicks.entries()].map(([espnEventId, pickedTeam]) => ({
      espnEventId,
      pickedTeam,
    }));
    mutate({ poolId, data: { picks } });
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
      totalPicked: matches.filter((m) => m.pickedTeam || pendingPicks.has(m.espnEventId)).length,
      totalCorrect: matches.filter((m) => m.isCorrect === true).length,
    };
  }, [matches, pendingPicks]);

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
    <>
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
              <TabsTrigger
                value="bracket"
                className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-yellow-500/10 data-[state=active]:text-yellow-400 flex gap-2"
              >
                <Trophy className="w-4 h-4 md:w-5 md:h-5" /> Bracket
              </TabsTrigger>
              {isCommissioner && (
                <TabsTrigger
                  value="commissioner"
                  className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 text-muted-foreground hover:text-foreground md:ml-auto flex gap-2"
                >
                  <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" /> Commissioner
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <div className="md:hidden pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-card to-transparent rounded-r-lg z-10" />
        </div>

        <div className="mt-8">
          {/* Matches tab */}
          <TabsContent value="matches" className="m-0 focus-visible:outline-none">
            {/* Summary bar + Save button */}
            {matches && matches.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-6">
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

                {/* Save Picks button — always rendered, enabled only when pending picks exist */}
                <div className="ml-auto">
                  <Button
                    onClick={handleSave}
                    disabled={pendingPicks.size === 0 || isSaving}
                    className={cn(
                      "font-bebas tracking-wider text-base px-5 py-2.5 h-auto transition-all",
                      pendingPicks.size > 0 && !isSaving
                        ? "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30"
                        : "",
                    )}
                    variant={pendingPicks.size > 0 ? "default" : "outline"}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {pendingPicks.size > 0
                          ? `Save ${pendingPicks.size} Pick${pendingPicks.size !== 1 ? "s" : ""}`
                          : "Save Picks"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Pending picks reminder */}
            {pendingPicks.size > 0 && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                {pendingPicks.size} unsaved pick{pendingPicks.size !== 1 ? "s" : ""} — click{" "}
                <span className="font-bold">Save Picks</span> to submit
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
                        pendingTeam={pendingPicks.get(match.espnEventId) ?? null}
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
            <WcBracketLeaderboard
              poolId={poolId}
              onSelectPlayer={setSelectedPlayer}
            />
          </TabsContent>

          {/* Bracket tree tab */}
          <TabsContent value="bracket" className="m-0 focus-visible:outline-none">
            <BracketTreeTab poolId={poolId} />
          </TabsContent>

          {/* Commissioner tab */}
          {isCommissioner && (
            <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
              <div className="space-y-8 max-w-4xl">
                {/* Invite Code */}
                <Card className="bg-card border-border/50 overflow-hidden relative">
                  <div className="absolute right-0 top-0 bottom-0 w-32 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.1),transparent)] pointer-events-none" />
                  <CardHeader>
                    <CardTitle className="font-bebas text-3xl tracking-wide text-primary">Invite Code</CardTitle>
                    <CardDescription>Share this code to let sharks into the pool.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
                        {inviteCode ?? "—"}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="lg" onClick={copyInvite} disabled={!inviteCode} className="font-bebas text-xl tracking-wider">
                          <Copy className="w-5 h-5 mr-2" /> Copy Code
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          disabled={!inviteCode}
                          className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                          onClick={copyInviteLink}
                        >
                          <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Settings */}
                <Card className="bg-card border-border/50">
                  <CardHeader>
                    <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-muted-foreground" /> Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-2">
                      <Label className="font-bebas text-lg tracking-wide">Pool Name</Label>
                      <Input value={commName} onChange={e => setCommName(e.target.value)} className="bg-background/50 border-border" />
                    </div>
                    <div className="grid gap-2">
                      <Label className="font-bebas text-lg tracking-wide">Description</Label>
                      <Textarea value={commDesc} onChange={e => setCommDesc(e.target.value)} className="bg-background/50 border-border min-h-[100px]" />
                    </div>
                    <Button onClick={handleCommissionerSave} disabled={updatePool.isPending} className="w-full font-bebas text-xl tracking-wider h-12 mt-2">
                      {updatePool.isPending ? "Saving..." : "Save Settings"}
                    </Button>
                  </CardContent>
                </Card>

                <CancelPoolButton poolId={poolId} />
              </div>
            </TabsContent>
          )}
        </div>
      </Tabs>

      {/* Member picks modal */}
      {selectedPlayer && (
        <WcBracketMemberPicksModal
          poolId={poolId}
          userId={selectedPlayer.userId}
          displayName={selectedPlayer.displayName || selectedPlayer.username}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </>
  );
}
