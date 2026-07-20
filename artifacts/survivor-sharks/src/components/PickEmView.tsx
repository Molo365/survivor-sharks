import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { CancelPoolButton } from "@/components/CancelPoolButton";
import {
  useGetPickEmDailyPicks,
  useGetPickEmGames,
  useGetPickEmWeekGames,
  useSubmitPickEmPicks,
  useGetPickEmLeaderboard,
  useGetPickEmYesterdayWinner,
  useGetPickEmDailyResults,
  useGetPickEmPrevWeekResults,
  getGetPickEmGamesQueryKey,
  getGetPickEmWeekGamesQueryKey,
  getGetPickEmLeaderboardQueryKey,
  getGetPickEmYesterdayWinnerQueryKey,
  getGetPickEmDailyResultsQueryKey,
  getGetPickEmPrevWeekResultsQueryKey,
  useGetPool,
  useGetPoolSchedule,
  useUpdatePool,
  getGetPoolQueryKey,
  getGetPoolScheduleQueryKey,
} from "@workspace/api-client-react";
import type { PickEmGame, PickEmSlate, MlsWeekGames, PickEmLeaderboardGame, PickEmLeaderboardEntry, PickEmPlayerPick, PickEmDailyBreakdown, PickEmDailyPickDetail } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PickEmTiebreakerCard } from "@/components/PickEmTiebreakerCard";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { WcScheduleView } from "@/components/WcScheduleView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, ShieldAlert, Clock, Check, X, Trophy, RefreshCw, Copy, Wifi, LayoutGrid, BarChart2, BarChart3, Users, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Lock, Download, Camera, Shuffle, Zap, Play, OctagonX, Settings2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { invalidatePoolQueries } from "@/lib/queryUtils";
import { downloadGridPdf } from "@/lib/downloadGridPdf";

function BaseDiamond({
  onFirst,
  onSecond,
  onThird,
  size = 26,
}: {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  size?: number;
}) {
  const c = size / 2;
  const d = size * 0.38;
  const r = size * 0.12;
  const top = { x: c, y: c - d };
  const right = { x: c + d, y: c };
  const bottom = { x: c, y: c + d };
  const left = { x: c - d, y: c };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon
        points={`${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.8"
      />
      <circle cx={bottom.x} cy={bottom.y} r={r * 0.65} fill="rgba(255,255,255,0.12)" />
      <circle
        cx={left.x} cy={left.y} r={r}
        fill={onThird ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onThird ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
      <circle
        cx={top.x} cy={top.y} r={r}
        fill={onSecond ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onSecond ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
      <circle
        cx={right.x} cy={right.y} r={r}
        fill={onFirst ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onFirst ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
    </svg>
  );
}

function OutDots({ outs }: { outs: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full border",
            i < outs
              ? "bg-red-400 border-red-500"
              : "bg-transparent border-white/25",
          )}
        />
      ))}
    </div>
  );
}

function pickRefetchInterval(data: PickEmSlate | undefined): number {
  if (!data || data.games.length === 0) return 5 * 60 * 1000;
  const hasLive = data.games.some((g) => g.status === "in_progress");
  if (hasLive) return 30 * 1000;
  const allFinal = data.games.every((g) => g.status === "final");
  if (allFinal) return 5 * 60 * 1000;
  return 60 * 1000;
}

interface PickEmViewProps {
  poolId: number;
  poolName: string;
  poolDescription?: string;
  commissionerId: number;
  inviteCode: string;
  sport?: string;
  pickFrequency?: string;
  isRecurring?: boolean;
  entryFee?: number | null;
}

const WC_PICK_OPTIONS = ["home_win", "draw", "away_win"] as const;
type WcPickOption = (typeof WC_PICK_OPTIONS)[number];
const WC_PICK_LABELS: Record<WcPickOption, string> = {
  away_win: "Away Win",
  draw: "Draw",
  home_win: "Home Win",
};
const WC_PICK_SHORT: Record<WcPickOption, string> = {
  away_win: "AW",
  draw: "D",
  home_win: "HW",
};

function WcGameCard({
  game,
  pickedOption,
  onPick,
}: {
  game: PickEmGame;
  pickedOption: WcPickOption | null;
  onPick: (opt: WcPickOption) => void;
}) {
  const isFinal = game.status === "final" || (game.status?.toUpperCase().includes("FINAL") ?? false);
  const isLive = !isFinal && (game.status === "in_progress" || game.status?.toUpperCase() === "STATUS_IN_PROGRESS");
  const isPostponed = !isFinal && game.status === "postponed";
  const isLocked = game.deadlinePassed || isLive || isPostponed;

  const result = pickedOption ? game.userPickResult : null;
  const isCorrect = result === "correct";
  const isWrong = result === "incorrect";
  const isPickPostponed = result === "postponed";

  return (
    <div
      className={cn(
        "shark-card rounded-xl border overflow-hidden relative",
        isLive ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]" : "border-border/40",
      )}
    >
      {isLive && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none z-10" />
      )}
      {isLive && (
        <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shadow-md">
          <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
          Live
        </span>
      )}

      {/* Teams row */}
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        {/* Away team */}
        <div className="flex items-center gap-2 flex-1">
          {game.awayTeam.logoUrl && (
            <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
              <img src={game.awayTeam.logoUrl} alt={game.awayTeam.name} className="w-8 h-8 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <div>
            <div className="font-bebas tracking-wide text-sm leading-tight text-muted-foreground">{game.awayTeam.name}</div>
            {(isFinal || isLive) && game.awayScore != null && (
              <div className="font-bebas text-2xl leading-none text-foreground">{game.awayScore}</div>
            )}
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          {isLive ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none whitespace-nowrap">
              ● LIVE{game.liveDetail ? ` · ${game.liveDetail}` : ""}
            </span>
          ) : isFinal ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">Final</span>
          ) : isPostponed ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/40 leading-none">PPD</span>
          ) : (
            <div className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5 text-primary/50 shrink-0" />
              <span className="text-[9px] text-muted-foreground/60 font-medium whitespace-nowrap">{formatTime(game.startTime)}</span>
            </div>
          )}
        </div>

        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 justify-end text-right">
          <div>
            <div className="font-bebas tracking-wide text-sm leading-tight text-muted-foreground">{game.homeTeam.name}</div>
            {(isFinal || isLive) && game.homeScore != null && (
              <div className="font-bebas text-2xl leading-none text-foreground">{game.homeScore}</div>
            )}
          </div>
          {game.homeTeam.logoUrl && (
            <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
              <img src={game.homeTeam.logoUrl} alt={game.homeTeam.name} className="w-8 h-8 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
        </div>
      </div>

      {/* 3-way pick buttons */}
      <div className="grid grid-cols-3 gap-1 px-3 pb-3">
        {(["away_win", "draw", "home_win"] as WcPickOption[]).map((opt) => {
          const isPicked = pickedOption === opt;
          const label = opt === "away_win"
            ? `${game.awayTeam.abbreviation} Win`
            : opt === "home_win"
              ? `${game.homeTeam.abbreviation} Win`
              : "Draw";
          return (
            <button
              key={opt}
              type="button"
              disabled={isLocked}
              onClick={() => !isLocked && onPick(opt)}
              className={cn(
                "rounded-lg border-2 px-2 py-2 text-center font-bebas text-sm tracking-wide transition-all select-none",
                isLocked ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
                isPicked && !isCorrect && !isWrong
                  ? "border-primary bg-primary/10 ring-2 ring-primary/40 text-foreground"
                  : isPicked && isCorrect
                    ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/40 text-green-400"
                    : isPicked && isWrong
                      ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30 text-destructive/80"
                      : "border-border/40 bg-card/60 text-muted-foreground hover:border-border",
              )}
            >
              {label}
              {isPicked && isCorrect && <Check className="w-3 h-3 inline ml-1 text-green-400" />}
              {isPicked && isWrong && <X className="w-3 h-3 inline ml-1" />}
              {isPicked && isPickPostponed && <span className="text-[9px] ml-1 font-bold">PPD</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

interface GameCardProps {
  game: PickEmGame;
  pickedTeamId: string | null;
  onPick: (teamId: string) => void;
  isTiebreakerGame?: boolean;
}

function GameCard({ game, pickedTeamId, onPick, isTiebreakerGame }: GameCardProps) {
  const isFinal = game.status === "final" || (game.status?.toUpperCase().includes("FINAL") ?? false);
  const isLive = !isFinal && (game.status === "in_progress" || game.status?.toUpperCase() === "STATUS_IN_PROGRESS");
  const isPostponed = !isFinal && game.status === "postponed";
  const isLocked = game.deadlinePassed || isLive || isPostponed;

  function teamBtn(
    team: PickEmGame["awayTeam"],
    side: "away" | "home",
    score: number | null | undefined,
    record: string | null | undefined,
    pitcher: PickEmGame["awayPitcher"],
  ) {
    const isPicked = pickedTeamId === team.id;
    const result = isPicked ? game.userPickResult : null;
    const isCorrect = result === "correct";
    const isWrong = result === "incorrect";
    const isPickPostponed = result === "postponed";
    const isHome = side === "home";

    // Build pitcher line e.g. "Spencer Miles (5-4) 3.45 ERA"
    const pitcherRecord = pitcher?.wins != null && pitcher?.losses != null ? `(${pitcher.wins}-${pitcher.losses})` : null;
    const pitcherEra = pitcher?.era != null ? `${pitcher.era} ERA` : null;
    const pitcherLine = pitcher?.name
      ? [pitcher.name, pitcherRecord, pitcherEra].filter(Boolean).join(" ")
      : null;

    const logo = (
      <div className="shrink-0 rounded-full bg-white/90 p-1.5 shadow-sm">
        <img
          src={
            team.logoUrl ??
            `https://a.espncdn.com/i/teamlogos/mlb/500/${team.abbreviation.toLowerCase()}.png`
          }
          alt={team.name}
          className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );

    const info = (
      <div className={cn("flex-1 flex flex-col gap-0.5 min-w-0", isHome ? "items-end text-right" : "items-start text-left")}>
        {/* Team name */}
        <span className={cn("font-bebas tracking-wide text-base sm:text-xl leading-tight", isPicked ? "text-foreground" : "text-muted-foreground")}>
          {team.name}
        </span>

        {/* Record */}
        {record && (
          <span className="text-[12px] text-white font-semibold tabular-nums leading-none">
            {record}
          </span>
        )}

        {/* Pitcher — scheduled games only */}
        {pitcherLine && !isFinal && !isLive && (
          <span className="text-[10px] leading-snug break-words" style={{ color: "#cccccc" }}>
            {pitcherLine}
          </span>
        )}

        {/* Score — live or final */}
        {(isFinal || isLive) && score != null && (
          <span className={cn(
            "font-bebas text-3xl leading-none mt-0.5",
            isLive
              ? "text-white"
              : isPicked && isCorrect
                ? "text-green-400"
                : isPicked && isWrong
                  ? "text-destructive/70"
                  : "text-foreground/60",
          )}>
            {score}
          </span>
        )}

        {/* Pick indicator */}
        {isPicked && (
          <div className="flex items-center gap-1 mt-0.5">
            {isCorrect ? (
              <span className="text-green-400 flex items-center">
                <Check className="w-3 h-3" />
              </span>
            ) : isWrong ? (
              <span className="text-destructive/80 flex items-center">
                <X className="w-3 h-3" />
              </span>
            ) : isPickPostponed ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                PPD
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Picked
              </span>
            )}
          </div>
        )}
      </div>
    );

    return (
      <button
        key={team.id}
        type="button"
        disabled={isLocked}
        onClick={() => !isLocked && onPick(team.id)}
        className={cn(
          "flex-1 flex items-center gap-2 p-2.5 sm:gap-3 sm:p-4 rounded-xl border-2 transition-all select-none",
          isLocked ? "cursor-default" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
          isPicked && !isCorrect && !isWrong
            ? "border-primary bg-primary/10 ring-2 ring-primary/40"
            : isPicked && isCorrect
              ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/40"
              : isPicked && isWrong
                ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
                : "border-border/40 bg-card/60 hover:border-border",
          isHome ? "flex-row-reverse" : "flex-row",
        )}
      >
        {logo}
        {info}
      </button>
    );
  }

  return (
    <div className={cn(
      "shark-card rounded-xl border overflow-hidden relative",
      isLive
        ? "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.28)]"
        : isTiebreakerGame
          ? "border-yellow-500/50 shadow-[0_0_14px_rgba(234,179,8,0.18)]"
          : "border-border/40",
    )}>
      {/* Tiebreaker glow overlay */}
      {isTiebreakerGame && !isLive && (
        <span className="absolute inset-0 rounded-xl border border-yellow-500/30 pointer-events-none z-10" />
      )}
      {/* Pulsing live border overlay */}
      {isLive && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none z-10" />
      )}
      {/* LIVE badge */}
      {isLive && (
        <span className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shadow-md">
          <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />
          Live
        </span>
      )}
      {/* TIEBREAKER badge */}
      {isTiebreakerGame && (
        <span className="absolute top-2 right-2 z-20 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 leading-none">
          <Shuffle className="w-2.5 h-2.5" />
          Tiebreaker
        </span>
      )}
      <div className="flex items-stretch gap-0">
        {teamBtn(game.awayTeam, "away", game.awayScore, game.awayRecord, game.awayPitcher)}

        {/* Center divider */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[72px] sm:px-3 sm:min-w-[88px]">
          {isLive ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none whitespace-nowrap">
                ● LIVE
              </span>
              {game.liveDetail && (
                <span className="font-bebas text-[11px] text-red-300/80 leading-none tracking-wide whitespace-nowrap">
                  {game.liveDetail}
                </span>
              )}
              {game.liveBaseRunners && (
                <div className="flex flex-col items-center gap-0.5 mt-0.5">
                  <BaseDiamond
                    onFirst={game.liveBaseRunners.onFirst}
                    onSecond={game.liveBaseRunners.onSecond}
                    onThird={game.liveBaseRunners.onThird}
                  />
                  {game.liveOuts != null && <OutDots outs={game.liveOuts} />}
                </div>
              )}
            </>
          ) : isFinal ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground/60 border-border/30 leading-none">
              Final
            </span>
          ) : isPostponed ? (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/40 leading-none">
              PPD
            </span>
          ) : (
            <>
              <span className="font-bebas text-xs text-muted-foreground/70 tracking-widest uppercase">
                vs
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-primary/60 shrink-0" />
                <span className="text-[11px] sm:text-xs text-muted-foreground leading-tight font-semibold whitespace-nowrap">
                  {formatTime(game.startTime)}
                </span>
              </div>
            </>
          )}
        </div>

        {teamBtn(game.homeTeam, "home", game.homeScore, game.homeRecord, game.homePitcher)}
      </div>
    </div>
  );
}

// ── Picks Grid (leaderboard with per-player per-game picks) ──────────────────

interface PicksGridProps {
  games: PickEmLeaderboardGame[];
  entries: PickEmLeaderboardEntry[];
  currentUserId: number | null;
  week: number;
  isWc?: boolean;
  phase?: string | null;
}

function PicksGrid({ games, entries, currentUserId, week, isWc, phase }: PicksGridProps) {
  const title = isWc
    ? phase === "knockout_stage" ? "Knockout Stage Grid"
      : phase === "group_stage" ? "Group Stage Grid"
      : "Picks Grid"
    : `Week ${week} Standings`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas text-2xl tracking-wide text-foreground">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">
          {entries.length} player{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Scrollable picks grid */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: `${Math.max(400, 220 + games.length * (isWc ? 68 : 72))}px` }}>
            <tbody>
              {entries.map((entry, idx) => {
                const isMe = entry.userId === currentUserId;
                const pickMap = new Map(entry.picks.map((p) => [p.gameId, p]));
                const pct = entry.picked > 0
                  ? Math.round((entry.correct / entry.picked) * 100)
                  : null;

                return (
                  <tr
                    key={entry.userId}
                    className={cn(
                      idx < entries.length - 1 && "[&>td]:border-b-2 [&>td]:border-white/20",
                      isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                    )}
                  >
                    {/* Sticky player info */}
                    <td className={cn(
                      "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30 bg-card",
                      isMe && "ring-inset ring-1 ring-primary/20",
                    )}>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-bebas text-base w-5 shrink-0",
                          entry.rank === 1 ? "text-yellow-400"
                          : entry.rank === 2 ? "text-zinc-300"
                          : entry.rank === 3 ? "text-amber-600"
                          : "text-muted-foreground/40",
                        )}>
                          {entry.rank}
                        </span>
                        <span className={cn("font-medium text-sm truncate max-w-[110px]", isMe ? "text-primary" : "text-foreground")}>
                          {entry.displayName || entry.username}
                          {isMe && (
                            <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Per-game pick cells */}
                    {games.map((game) => {
                      if (isWc) {
                        const pick = pickMap.get(game.id);
                        const pickedOpt = (pick?.pickedTeamId ?? null) as WcPickOption | null;
                        const result = pick?.result ?? null;

                        const sectionCn = (opt: WcPickOption) => {
                          const active = pickedOpt === opt;
                          if (!active) return "border border-border/20 bg-transparent";
                          if (result === "correct") return "border border-green-500/70 bg-green-500/15 shadow-[0_0_8px_rgba(34,197,94,0.3)]";
                          if (result === "incorrect") return "border border-red-500/70 bg-red-500/15 shadow-[0_0_8px_rgba(239,68,68,0.3)]";
                          return "border border-primary/70 bg-primary/15 shadow-[0_0_8px_rgba(99,102,241,0.3)]";
                        };

                        const abbrevCn = (opt: WcPickOption) => {
                          const active = pickedOpt === opt;
                          if (!active) return "text-muted-foreground/25";
                          if (result === "correct") return "text-green-400";
                          if (result === "incorrect") return "text-red-400";
                          return "text-foreground";
                        };

                        const TeamSection = ({ opt, team }: { opt: "home_win" | "away_win"; team: typeof game.homeTeam }) => (
                          <div className={cn("flex flex-col items-center justify-center gap-[3px] rounded-md py-1.5 px-1 transition-all", sectionCn(opt))}>
                            <div className={cn("rounded-full p-[3px] shrink-0 transition-all", pickedOpt === opt ? "bg-white/90" : "bg-white/15")}>
                              {team.logoUrl
                                ? <img src={team.logoUrl} alt="" className="w-[18px] h-[18px] object-contain block" />
                                : <div className="w-[18px] h-[18px] rounded-full bg-muted/40 flex items-center justify-center">
                                    <span className="font-bebas text-[7px] text-muted-foreground">{team.abbreviation?.slice(0, 1)}</span>
                                  </div>
                              }
                            </div>
                            <span className={cn("font-bebas text-[10px] tracking-wider leading-none", abbrevCn(opt))}>
                              {team.abbreviation}
                            </span>
                            {pickedOpt === opt && result === "correct" && <Check className="w-2.5 h-2.5 text-green-400" />}
                            {pickedOpt === opt && result === "incorrect" && <X className="w-2.5 h-2.5 text-red-400" />}
                          </div>
                        );

                        return (
                          <td key={game.id} className="px-[3px] py-1.5 align-middle">
                            <div className="flex flex-col gap-[2px]" style={{ width: 60 }}>
                              <TeamSection opt="home_win" team={game.homeTeam} />
                              {/* Draw section */}
                              <div className={cn("flex flex-col items-center justify-center rounded-md py-[5px] px-1 transition-all", sectionCn("draw"))}>
                                <span className={cn(
                                  "font-bebas text-[9px] tracking-[0.1em] leading-none select-none",
                                  pickedOpt === "draw"
                                    ? result === "correct" ? "text-green-400"
                                      : result === "incorrect" ? "text-red-400"
                                      : "text-foreground"
                                    : "text-muted-foreground/25",
                                )}>DRAW</span>
                                {pickedOpt === "draw" && result === "correct" && <Check className="w-2.5 h-2.5 text-green-400 mt-0.5" />}
                                {pickedOpt === "draw" && result === "incorrect" && <X className="w-2.5 h-2.5 text-red-400 mt-0.5" />}
                              </div>
                              <TeamSection opt="away_win" team={game.awayTeam} />
                            </div>
                          </td>
                        );
                      }

                      // Non-WC pick cells
                      const pick = pickMap.get(game.id);
                      if (!pick || !pick.pickedTeamId) {
                        return (
                          <td key={game.id} className="px-1 py-2 text-center">
                            <span className="text-muted-foreground/20 text-xs">—</span>
                          </td>
                        );
                      }

                      const isAway = pick.pickedTeamId === game.awayTeam.id;
                      const team = isAway ? game.awayTeam : game.homeTeam;

                      return (
                        <td key={game.id} className="px-1 py-2 text-center">
                          <div className={cn(
                            "inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 border text-center min-w-[52px]",
                            pick.result === "correct"
                              ? "border-green-500/40 bg-green-500/10"
                              : pick.result === "incorrect"
                              ? "border-red-500/40 bg-red-500/10"
                              : "border-border/30 bg-muted/10",
                          )}>
                            {team.logoUrl && (
                              <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                                <img src={team.logoUrl} alt={team.abbreviation} className="w-4 h-4 object-contain" />
                              </div>
                            )}
                            <span className={cn(
                              "font-bebas text-[11px] tracking-wide leading-none",
                              pick.result === "correct" ? "text-green-400"
                              : pick.result === "incorrect" ? "text-red-400"
                              : "text-muted-foreground/70",
                            )}>
                              {team.abbreviation}
                            </span>
                            {pick.result === "correct" && <Check className="w-2.5 h-2.5 text-green-400" />}
                            {pick.result === "incorrect" && <X className="w-2.5 h-2.5 text-red-400" />}
                          </div>
                        </td>
                      );
                    })}

                    {/* Score summary */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <span className="font-bebas text-lg text-green-400">{entry.correct}</span>
                      <span className="font-bebas text-lg text-muted-foreground/40">/{entry.picked}</span>
                      {pct !== null && (
                        <span className="ml-1.5 font-mono text-[10px] text-primary/50">{pct}%</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/40 text-center">
        Scroll right to see all games · Results update automatically
      </p>
    </div>
  );
}

// ── Stats View ────────────────────────────────────────────────────────────────

interface StatsViewProps {
  games: PickEmLeaderboardGame[];
  entries: PickEmLeaderboardEntry[];
  currentUserId: number | null;
  isWc?: boolean;
}

function StatsView({ games, entries, currentUserId, isWc }: StatsViewProps) {
  const playerStats = [...entries]
    .map((entry) => ({
      ...entry,
      pct: entry.picked > 0 ? Math.round((entry.correct / entry.picked) * 100) : null,
    }))
    .sort((a, b) => {
      const pa = a.pct ?? -1;
      const pb = b.pct ?? -1;
      return pb - pa || b.correct - a.correct;
    });

  const withPicks = playerStats.filter((p) => p.picked > 0);
  const avgPct =
    withPicks.length > 0
      ? Math.round(withPicks.reduce((s, p) => s + (p.pct ?? 0), 0) / withPicks.length)
      : null;

  const gamePickStats = games
    .map((game) => {
      const awayCount = entries.filter((e) =>
        e.picks.some((p) => p.gameId === game.id && p.pickedTeamId !== null && p.pickedTeamId === game.awayTeam.id),
      ).length;
      const homeCount = entries.filter((e) =>
        e.picks.some((p) => p.gameId === game.id && p.pickedTeamId !== null && p.pickedTeamId === game.homeTeam.id),
      ).length;
      const total = awayCount + homeCount;
      return {
        game,
        awayCount,
        homeCount,
        total,
        awayPct: total > 0 ? Math.round((awayCount / total) * 100) : 50,
        homePct: total > 0 ? Math.round((homeCount / total) * 100) : 50,
      };
    })
    .filter((g) => g.total > 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border/40 rounded-xl p-4 text-center">
          <div className="font-bebas text-3xl text-accent">{entries.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 flex items-center justify-center gap-1">
            <Users className="w-3 h-3" /> Players
          </div>
        </div>
        <div className="bg-card border border-border/40 rounded-xl p-4 text-center">
          <div className="font-bebas text-3xl text-green-400">{avgPct != null ? `${avgPct}%` : "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Avg Accuracy</div>
        </div>
        <div className="bg-card border border-border/40 rounded-xl p-4 text-center">
          <div className="font-bebas text-3xl text-primary">{games.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{isWc ? "Matches" : "Games Today"}</div>
        </div>
      </div>

      {/* Player accuracy */}
      {playerStats.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bebas text-xl tracking-wide text-muted-foreground uppercase">
            Player Accuracy
          </h3>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            {playerStats.map((entry, idx) => {
              const isMe = entry.userId === currentUserId;
              const pct = entry.pct ?? 0;
              return (
                <div
                  key={entry.userId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0",
                    isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "font-bebas text-lg w-5 shrink-0 text-center",
                      idx === 0
                        ? "text-yellow-400"
                        : idx === 1
                          ? "text-zinc-300"
                          : idx === 2
                            ? "text-amber-600"
                            : "text-muted-foreground/40",
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span className={cn("flex-1 font-medium text-sm truncate", isMe && "text-primary")}>
                    {entry.displayName || entry.username}
                    {isMe && (
                      <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                        you
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 bg-muted/30 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="h-full bg-green-500/60 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-bebas text-lg text-green-400 w-5 text-right">{entry.correct}</span>
                    <span className="font-bebas text-lg text-muted-foreground/40 w-8">/{entry.picked}</span>
                    <span className="font-mono text-xs text-muted-foreground/70 w-10 text-right">
                      {entry.pct != null ? `${entry.pct}%` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pick distribution */}
      {gamePickStats.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bebas text-xl tracking-wide text-muted-foreground uppercase">
            Pick Distribution
          </h3>
          <div className="space-y-2">
            {gamePickStats.map(({ game, awayCount, homeCount, awayPct, homePct }) => (
              <div key={game.id} className="rounded-xl border border-border/40 bg-card/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-1">
                    {game.awayTeam.logoUrl && (
                      <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                        <img
                          src={game.awayTeam.logoUrl}
                          alt={game.awayTeam.abbreviation}
                          className="w-4 h-4 object-contain"
                        />
                      </div>
                    )}
                    <span className="font-bebas tracking-wide">{game.awayTeam.abbreviation}</span>
                    <span className="text-muted-foreground ml-auto">
                      {awayCount} {awayCount === 1 ? "pick" : "picks"}
                    </span>
                  </div>
                  <span className="text-muted-foreground/40 shrink-0">@</span>
                  <div className="flex items-center gap-1.5 flex-1 flex-row-reverse">
                    {game.homeTeam.logoUrl && (
                      <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                        <img
                          src={game.homeTeam.logoUrl}
                          alt={game.homeTeam.abbreviation}
                          className="w-4 h-4 object-contain"
                        />
                      </div>
                    )}
                    <span className="font-bebas tracking-wide">{game.homeTeam.abbreviation}</span>
                    <span className="text-muted-foreground mr-auto">
                      {homeCount} {homeCount === 1 ? "pick" : "picks"}
                    </span>
                  </div>
                </div>
                <div className="flex rounded-full overflow-hidden h-3">
                  <div
                    className="bg-blue-500/50 h-full transition-all flex items-center justify-end pr-1"
                    style={{ width: `${awayPct}%` }}
                  >
                    {awayPct >= 25 && (
                      <span className="text-[8px] font-bold text-white">{awayPct}%</span>
                    )}
                  </div>
                  <div
                    className="bg-green-500/50 h-full transition-all flex items-center justify-start pl-1"
                    style={{ width: `${homePct}%` }}
                  >
                    {homePct >= 25 && (
                      <span className="text-[8px] font-bold text-white">{homePct}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-bebas text-2xl tracking-wide">No picks yet today</p>
          <p className="text-sm mt-1">Stats appear once players submit picks.</p>
        </div>
      )}
    </div>
  );
}

function getTodayEt(): string {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  return new Date(Date.now() - FIVE_HOURS_MS).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// ── Snapshot (post-lock pick accountability table) ───────────────────────────

interface SnapshotViewProps {
  slate: PickEmSlate;
  entries: PickEmLeaderboardEntry[];
  lbGames: PickEmLeaderboardGame[];
  currentUserId: number | null;
  poolName: string;
  sport?: string;
}

function SnapshotView({ slate, entries, lbGames, currentUserId, poolName, sport = "mlb" }: SnapshotViewProps) {
  const slateGameIds = new Set(slate.games.map((g) => g.id));

  // Merge slate game order + team IDs with leaderboard logo URLs
  const snapshotGames = useMemo(() => {
    const lbGameById = new Map(lbGames.map((g) => [g.id, g]));
    return slate.games.map((sg) => ({
      id: sg.id,
      awayTeam: {
        id: sg.awayTeam.id,
        abbreviation: sg.awayTeam.abbreviation,
        logoUrl: lbGameById.get(sg.id)?.awayTeam.logoUrl ?? sg.awayTeam.logoUrl ?? null,
      },
      homeTeam: {
        id: sg.homeTeam.id,
        abbreviation: sg.homeTeam.abbreviation,
        logoUrl: lbGameById.get(sg.id)?.homeTeam.logoUrl ?? sg.homeTeam.logoUrl ?? null,
      },
    }));
  }, [slate.games, lbGames]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.rank - b.rank),
    [entries],
  );

  function handleDownloadPdf() {
    const year = slate.date.substring(0, 4);
    const sportLabel = sport.toUpperCase().replace("WORLDCUP", "WORLD CUP").replace("INTL", "INTL SOCCER");
    const gameColHeaders = snapshotGames.map((g) => `${g.awayTeam.abbreviation}@${g.homeTeam.abbreviation}`);
    const pdfRows = sortedEntries.map((entry) => {
      const name = `${entry.rank}. ${entry.displayName || entry.username}`;
      const pickMap = new Map(
        entry.picks.filter((p) => slateGameIds.has(p.gameId)).map((p) => [p.gameId, p]),
      );
      const todayCorrect = snapshotGames.filter((g) => pickMap.get(g.id)?.result === "correct").length;
      const todayPicked = snapshotGames.filter((g) => pickMap.has(g.id)).length;
      const pct = todayPicked > 0 ? Math.round((todayCorrect / todayPicked) * 100) : null;
      const pickCells = snapshotGames.map((g) => {
        const pick = pickMap.get(g.id);
        if (!pick) return "—";
        const isAway = pick.pickedTeamId === g.awayTeam.id;
        const abbrev = isAway ? g.awayTeam.abbreviation : g.homeTeam.abbreviation;
        const suffix =
          pick.result === "correct" ? " W"
          : pick.result === "incorrect" ? " L"
          : pick.result === "postponed" ? " PPD"
          : "";
        return `${abbrev}${suffix}`;
      });
      const total = pct !== null ? `${todayCorrect}/${todayPicked} (${pct}%)` : "0/0";
      return { cells: [name, ...pickCells, total], isCurrentUser: entry.userId === currentUserId };
    });
    downloadGridPdf({
      filename: `${poolName.replace(/\s+/g, "_")}_snapshot_${slate.date}.pdf`,
      poolName,
      sport: `${sportLabel} · Season ${year}`,
      subtitle: `${entries.length} player${entries.length !== 1 ? "s" : ""} · ${snapshotGames.length} game${snapshotGames.length !== 1 ? "s" : ""} · ${slate.label}`,
      columns: ["Player", ...gameColHeaders, "Total"],
      rows: pdfRows,
      footer: `Snapshot · ${slate.date}`,
    });
  }

  const minWidth = Math.max(400, 220 + snapshotGames.length * 72);

  return (
    <div className="space-y-3">
      {/* Header row with PDF button */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bebas text-2xl tracking-wide text-foreground">Pick Snapshot</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {slate.label} · {entries.length} player{entries.length !== 1 ? "s" : ""} · {snapshotGames.length} game{snapshotGames.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            className="font-bebas text-base tracking-wider gap-1.5"
          >
            <Download className="w-4 h-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Grid — identical structure to PicksGrid, filtered to today's slate */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm border-separate border-spacing-0"
            style={{ minWidth: `${minWidth}px` }}
          >
            {/* Game column headers — away @ home abbreviation */}
            <thead>
              <tr className="bg-muted/[0.05]">
                <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2 border-b border-border/30 border-r border-border/20" />
                {snapshotGames.map((game) => (
                  <th
                    key={game.id}
                    className="px-1 py-2 text-center border-b border-border/30 font-mono text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap"
                    style={{ width: 72 }}
                  >
                    {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                  </th>
                ))}
                <th className="px-3 py-2 text-right border-b border-border/30 font-bebas text-xs text-muted-foreground/40 whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={snapshotGames.length + 2}
                    className="text-center py-10 text-sm text-muted-foreground"
                  >
                    No picks recorded yet.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry, idx) => {
                  const isMe = entry.userId === currentUserId;
                  const pickMap = new Map(
                    entry.picks
                      .filter((p) => slateGameIds.has(p.gameId))
                      .map((p) => [p.gameId, p]),
                  );
                  const todayCorrect = snapshotGames.filter(
                    (g) => pickMap.get(g.id)?.result === "correct",
                  ).length;
                  const todayPicked = snapshotGames.filter((g) => pickMap.has(g.id)).length;
                  const pct =
                    todayPicked > 0 ? Math.round((todayCorrect / todayPicked) * 100) : null;

                  return (
                    <tr
                      key={entry.userId}
                      className={cn(
                        idx < entries.length - 1 && "[&>td]:border-b-2 [&>td]:border-white/20",
                        isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                      )}
                    >
                      {/* Sticky player info — identical to PicksGrid */}
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30 bg-card",
                          isMe && "ring-inset ring-1 ring-primary/20",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-bebas text-base w-5 shrink-0",
                              entry.rank === 1 ? "text-yellow-400"
                              : entry.rank === 2 ? "text-zinc-300"
                              : entry.rank === 3 ? "text-amber-600"
                              : "text-muted-foreground/40",
                            )}
                          >
                            {entry.rank}
                          </span>
                          <span
                            className={cn(
                              "font-medium text-sm truncate max-w-[110px]",
                              isMe ? "text-primary" : "text-foreground",
                            )}
                          >
                            {entry.displayName || entry.username}
                            {isMe && (
                              <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                                you
                              </span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Per-game pick cells — matches PicksGrid non-WC, adds PPD amber */}
                      {snapshotGames.map((game) => {
                        const pick = pickMap.get(game.id);
                        if (!pick) {
                          return (
                            <td key={game.id} className="px-1 py-2 text-center">
                              <span className="text-muted-foreground/20 text-xs">—</span>
                            </td>
                          );
                        }

                        if (!pick.pickedTeamId) {
                          return (
                            <td key={game.id} className="px-1 py-2 text-center">
                              <span className="text-muted-foreground/20 text-xs">—</span>
                            </td>
                          );
                        }
                        const isAway = pick.pickedTeamId === game.awayTeam.id;
                        const team = isAway ? game.awayTeam : game.homeTeam;

                        return (
                          <td key={game.id} className="px-1 py-2 text-center">
                            <div
                              className={cn(
                                "inline-flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 border text-center min-w-[52px]",
                                pick.result === "correct"
                                  ? "border-green-500/40 bg-green-500/10"
                                  : pick.result === "incorrect"
                                  ? "border-red-500/40 bg-red-500/10"
                                  : pick.result === "postponed"
                                  ? "border-yellow-500/40 bg-yellow-500/10"
                                  : "border-border/30 bg-muted/10",
                              )}
                            >
                              {team.logoUrl && (
                                <div className="rounded-full bg-white/90 p-0.5 shrink-0">
                                  <img
                                    src={team.logoUrl}
                                    alt={team.abbreviation}
                                    className="w-4 h-4 object-contain"
                                  />
                                </div>
                              )}
                              <span
                                className={cn(
                                  "font-bebas text-[11px] tracking-wide leading-none",
                                  pick.result === "correct" ? "text-green-400"
                                  : pick.result === "incorrect" ? "text-red-400"
                                  : pick.result === "postponed" ? "text-yellow-400"
                                  : "text-muted-foreground/70",
                                )}
                              >
                                {team.abbreviation}
                              </span>
                              {pick.result === "correct" && (
                                <Check className="w-2.5 h-2.5 text-green-400" />
                              )}
                              {pick.result === "incorrect" && (
                                <X className="w-2.5 h-2.5 text-red-400" />
                              )}
                              {pick.result === "postponed" && (
                                <span className="text-[8px] font-bold tracking-widest text-yellow-400 leading-none">
                                  PPD
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Total — matches PicksGrid score summary column */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-bebas text-lg text-green-400">{todayCorrect}</span>
                        <span className="font-bebas text-lg text-muted-foreground/40">
                          /{todayPicked}
                        </span>
                        {pct !== null && (
                          <span className="ml-1.5 font-mono text-[10px] text-primary/50">{pct}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/40 text-center">
        Frozen at lock time · Scroll right to see all games · Results update automatically
      </p>
    </div>
  );
}

// ── Weekly Leaderboard ────────────────────────────────────────────────────────

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayAbbrev(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return SHORT_DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function generateWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => offsetDate(weekStart, i));
}

// ── Daily pick detail panel ───────────────────────────────────────────────────

function DailyPickPanel({ poolId, userId, date }: { poolId: number; userId: number; date: string }) {
  const { data: picks, isLoading } = useGetPickEmDailyPicks(poolId, { date, userId });

  if (isLoading) {
    return (
      <div className="px-3 py-3 space-y-2 border-t border-border/10 bg-muted/5">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!picks || picks.length === 0) {
    return (
      <div className="px-3 py-3 text-sm text-center text-muted-foreground border-t border-border/10 bg-muted/5">
        No picks recorded for this day.
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-1.5 border-t border-border/10 bg-muted/5">
      {picks.map((pick: PickEmDailyPickDetail) => {
        const pickedIsHome = pick.pickedTeamId === pick.homeTeam.id;
        const opponent = pickedIsHome ? pick.awayTeam : pick.homeTeam;
        const hasScore = pick.homeScore !== null && pick.awayScore !== null;
        const pickedScore = pickedIsHome ? pick.homeScore : pick.awayScore;
        const opponentScore = pickedIsHome ? pick.awayScore : pick.homeScore;

        return (
          <div
            key={pick.gameId}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 border",
              pick.result === "correct"
                ? "bg-green-500/[0.08] border-green-500/20"
                : pick.result === "incorrect"
                ? "bg-red-500/[0.08] border-red-500/20"
                : "bg-card/40 border-border/20",
            )}
          >
            {/* Result icon */}
            <div className="shrink-0 w-4">
              {pick.result === "correct" ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : pick.result === "incorrect" ? (
                <XCircle className="w-4 h-4 text-red-400" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-primary/30" />
              )}
            </div>

            {/* Picked team */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {pick.pickedTeamLogoUrl && (
                <img src={pick.pickedTeamLogoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
              )}
              <span className={cn(
                "font-medium text-sm truncate",
                pick.result === "correct" ? "text-green-300"
                  : pick.result === "incorrect" ? "text-red-300"
                  : "text-foreground",
              )}>
                {pick.pickedTeamName}
              </span>
            </div>

            {/* Opponent */}
            <span className="text-xs text-muted-foreground shrink-0">vs {opponent.abbreviation}</span>

            {/* Score */}
            {hasScore && (
              <span className="text-xs font-mono shrink-0 tabular-nums">
                <span className={cn(
                  pick.result === "correct" ? "text-green-400" :
                  pick.result === "incorrect" ? "text-red-400" :
                  "text-muted-foreground/70",
                )}>
                  {pickedScore}–{opponentScore}
                </span>
                {pick.result === "correct" && <span className="ml-1 text-[10px] font-bold text-green-400">W</span>}
                {pick.result === "incorrect" && <span className="ml-1 text-[10px] font-bold text-red-400">L</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Weekly leaderboard ────────────────────────────────────────────────────────

interface WeeklyLeaderboardProps {
  poolId: number;
  entries: PickEmLeaderboardEntry[];
  currentUserId: number | null;
  weekStart: string;
  weekEnd: string;
}

function WeeklyLeaderboard({ poolId, entries, currentUserId, weekStart, weekEnd }: WeeklyLeaderboardProps) {
  const todayEt = getTodayEt();
  const days = generateWeekDays(weekStart);
  const [openCell, setOpenCell] = useState<{ userId: number; date: string } | null>(null);

  function toggleCell(userId: number, date: string) {
    setOpenCell((prev) =>
      prev?.userId === userId && prev.date === date ? null : { userId, date },
    );
  }

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  const minWidth = Math.max(380, 150 + days.length * 40 + 80);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas text-2xl tracking-wide text-foreground">This Week's Standings</h3>
        <span className="text-xs text-muted-foreground">{fmtDate(weekStart)} – {fmtDate(weekEnd)}</span>
      </div>

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm border-separate border-spacing-0"
            style={{ minWidth: `${minWidth}px` }}
          >
            <thead>
              <tr className="bg-muted/[0.05]">
                <th className="sticky left-0 z-20 bg-card px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-bebas text-xs tracking-wider text-muted-foreground/40 min-w-[140px]">
                  Player
                </th>
                {days.map((date) => (
                  <th key={date} className={cn(
                    "px-1 py-2 text-center border-b border-border/30 font-bold text-[9px] uppercase tracking-wider whitespace-nowrap",
                    date === todayEt ? "text-primary" : "text-muted-foreground/40",
                  )} style={{ width: 40 }}>
                    {dayAbbrev(date)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right border-b border-border/30 font-bold text-[9px] uppercase tracking-wider text-muted-foreground/40 whitespace-nowrap" style={{ width: 72 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                    No picks yet this week.
                  </td>
                </tr>
              ) : entries.map((entry, idx) => {
                const isMe = entry.userId === currentUserId;
                const breakdownMap = new Map((entry.dailyBreakdown ?? []).map((db: PickEmDailyBreakdown) => [db.date, db]));
                const pct = entry.picked > 0 ? Math.round((entry.correct / entry.picked) * 100) : null;
                const isPanelOpen = openCell?.userId === entry.userId;
                const rowBg = isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]";

                return (
                  <Fragment key={entry.userId}>
                    <tr className={cn("border-b border-border/10", isPanelOpen && "border-b-0")}>
                      {/* Sticky player cell */}
                      <td className={cn(
                        "sticky left-0 z-20 px-3 py-2.5 border-r border-border/20 min-w-[140px]",
                        isMe ? "bg-[hsl(215,50%,7%)]" : "bg-card",
                      )}>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-bebas text-base w-5 shrink-0 text-center",
                            entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-amber-600" : "text-muted-foreground/40",
                          )}>
                            {entry.rank}
                          </span>
                          <span className={cn("font-medium text-sm truncate", isMe ? "text-primary" : "text-foreground")}>
                            {entry.displayName || entry.username}
                            {isMe && <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>}
                          </span>
                        </div>
                      </td>

                      {/* Per-day cells */}
                      {days.map((date) => {
                        const day = breakdownMap.get(date);
                        const isPast = date < todayEt;
                        const isToday = date === todayEt;
                        const isCellOpen = isPanelOpen && openCell?.date === date;

                        return (
                          <td key={date} className={cn("px-0.5 py-1.5 text-center", rowBg)}>
                            {day ? (() => {
                              const allCorrect = day.correct === day.picked && day.picked > 0;
                              return (
                                <button
                                  type="button"
                                  title={`View ${dayAbbrev(date)} picks`}
                                  onClick={() => toggleCell(entry.userId, date)}
                                  className={cn(
                                    "w-9 h-9 flex flex-col items-center justify-center rounded-md border mx-auto transition-all cursor-pointer",
                                    isCellOpen
                                      ? "ring-2 ring-primary/50 border-primary/50 bg-primary/10"
                                      : allCorrect
                                      ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                                      : "bg-muted/20 border-border/30 hover:bg-muted/30",
                                  )}
                                >
                                  <span className={cn("font-bebas text-sm leading-none", isCellOpen ? "text-primary" : allCorrect ? "text-green-400" : "text-foreground")}>
                                    {day.correct}
                                  </span>
                                  <span className="text-[8px] text-muted-foreground/50 leading-none">/{day.picked}</span>
                                </button>
                              );
                            })() : (isPast || isToday) ? (
                              <div className={cn(
                                "w-9 h-9 flex items-center justify-center rounded-md border mx-auto",
                                isToday ? "border-primary/20 bg-primary/5" : "border-border/15 bg-transparent",
                              )}>
                                <span className={cn("text-xs", isToday ? "text-primary/30" : "text-muted-foreground/20")}>—</span>
                              </div>
                            ) : (
                              <div className="w-9 h-9 flex items-center justify-center rounded-md border border-border/10 bg-transparent mx-auto">
                                <span className="text-[10px] text-muted-foreground/15">·</span>
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Weekly total */}
                      <td className={cn("px-3 py-2.5 text-right", rowBg)}>
                        <span className="font-bebas text-xl text-foreground">{entry.correct}</span>
                        <span className="font-bebas text-sm text-muted-foreground/40">/{entry.picked}</span>
                        {pct !== null && <div className="text-[10px] text-muted-foreground/50 leading-none">{pct}%</div>}
                      </td>
                    </tr>

                    {/* Expandable detail panel */}
                    {isPanelOpen && openCell && (
                      <tr className="border-b border-border/10">
                        <td colSpan={days.length + 2} className="p-0">
                          <DailyPickPanel poolId={poolId} userId={entry.userId} date={openCell.date} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DayResultsModal({
  open,
  onClose,
  poolId,
  date,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  poolId: number;
  date: string;
  currentUserId: number;
}) {
  const params = useMemo(() => ({ date }), [date]);
  const { data, isLoading } = useGetPickEmDailyResults(poolId, params, {
    query: {
      queryKey: getGetPickEmDailyResultsQueryKey(poolId, params),
      enabled: open && !!date,
      staleTime: 5 * 60 * 1000,
    },
  });

  const games = data?.games ?? [];
  const players = data?.players ?? [];

  // Build teamId → abbreviation map for compact cell labels
  const teamAbbrMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of games) {
      m.set(g.awayTeam.id, g.awayTeam.abbreviation);
      m.set(g.homeTeam.id, g.homeTeam.abbreviation);
    }
    return m;
  }, [games]);

  const minWidth = Math.max(400, 220 + games.length * 76);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[min(95vw,960px)] p-0 gap-0 flex flex-col overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            {data?.label ?? date} · Results
          </DialogTitle>
          {data && (
            <DialogDescription>
              {players.length} player{players.length !== 1 ? "s" : ""} · {games.length} game{games.length !== 1 ? "s" : ""}
              {!data.hasResults && " · not yet graded"}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="overflow-auto flex-1 p-4">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : !data?.hasResults || players.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Trophy className="w-9 h-9 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                {players.length === 0
                  ? "No picks recorded for this day."
                  : "Results haven't been graded yet."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm border-separate border-spacing-0"
                  style={{ minWidth: `${minWidth}px` }}
                >
                  <thead>
                    <tr className="bg-muted/[0.05]">
                      {/* Sticky player header */}
                      <th className="sticky left-0 z-10 bg-muted/[0.05] px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-bebas text-xs tracking-wider text-muted-foreground/40">
                        Player
                      </th>
                      {games.map((game) => (
                        <th
                          key={game.id}
                          className="px-1 py-2 text-center border-b border-border/30 font-mono text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap"
                          style={{ width: 76 }}
                        >
                          <div>{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                          {game.awayScore != null && game.homeScore != null && (
                            <div className="text-[9px] text-muted-foreground/35 font-normal mt-0.5">
                              {game.awayScore}–{game.homeScore}
                            </div>
                          )}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right border-b border-border/30 font-bebas text-xs text-muted-foreground/40 whitespace-nowrap">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, idx) => {
                      const isMe = player.userId === currentUserId;
                      const pickMap = new Map(player.picks.map((p) => [p.gameId, p]));
                      return (
                        <tr
                          key={player.userId}
                          className={cn(
                            idx < players.length - 1 && "[&>td]:border-b-2 [&>td]:border-white/20",
                            isMe
                              ? "bg-primary/5"
                              : idx % 2 === 0
                              ? "bg-transparent"
                              : "bg-muted/[0.03]",
                          )}
                        >
                          {/* Sticky player column */}
                          <td
                            className={cn(
                              "sticky left-0 z-10 px-3 py-2.5 border-r border-border/30 bg-card",
                              isMe && "ring-inset ring-1 ring-primary/20",
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {player.rank === 1 ? (
                                <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                              ) : (
                                <span
                                  className={cn(
                                    "font-bebas text-sm w-[14px] text-center shrink-0",
                                    player.rank === 2 ? "text-zinc-300"
                                    : player.rank === 3 ? "text-amber-600"
                                    : "text-muted-foreground/35",
                                  )}
                                >
                                  {player.rank}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "font-medium text-sm truncate max-w-[120px]",
                                  isMe ? "text-primary" : "text-foreground",
                                )}
                              >
                                {player.displayName || player.username}
                              </span>
                              {isMe && (
                                <span className="text-[9px] font-bold uppercase tracking-widest text-primary/50 shrink-0">
                                  you
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Per-game pick cells */}
                          {games.map((game) => {
                            const pick = pickMap.get(game.id);
                            if (!pick || !pick.pickedTeamId) {
                              return (
                                <td key={game.id} className="px-1 py-2.5 text-center">
                                  <span className="text-muted-foreground/25 text-xs">—</span>
                                </td>
                              );
                            }
                            const isCorrect = pick.result === "correct";
                            const isWrong = pick.result === "incorrect";
                            const isPostponed = pick.result === "postponed";
                            const abbr = teamAbbrMap.get(pick.pickedTeamId) ?? pick.pickedTeamName.slice(0, 4);
                            return (
                              <td key={game.id} className="px-1 py-2.5 text-center">
                                <span
                                  className={cn(
                                    "inline-block px-1.5 py-0.5 rounded text-[11px] font-bold font-mono tracking-wide",
                                    isCorrect && "bg-green-500/10 text-green-400 border border-green-500/25",
                                    isWrong && "bg-red-500/10 text-red-400 border border-red-500/25",
                                    isPostponed && "bg-yellow-500/8 text-yellow-500/60 border border-yellow-500/20",
                                    !isCorrect && !isWrong && !isPostponed && "bg-muted/10 text-muted-foreground/50 border border-border/20",
                                  )}
                                >
                                  {abbr}
                                </span>
                              </td>
                            );
                          })}

                          {/* Score */}
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <span className="font-bebas text-base text-foreground">{player.correct}</span>
                            <span className="font-bebas text-base text-muted-foreground/40">/{player.total}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Previous-week results modal ───────────────────────────────────────────────

function PrevWeekResultsModal({
  open,
  onClose,
  poolId,
  weekStart,
  weekEnd,
  entries,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  poolId: number;
  weekStart: string;
  weekEnd: string;
  entries: PickEmLeaderboardEntry[];
  currentUserId: number | null;
}) {
  const days = generateWeekDays(weekStart);
  const [openCell, setOpenCell] = useState<{ userId: number; date: string } | null>(null);

  function toggleCell(userId: number, date: string) {
    setOpenCell((prev) =>
      prev?.userId === userId && prev.date === date ? null : { userId, date },
    );
  }

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  const minWidth = Math.max(420, 150 + days.length * 44 + 80);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[min(95vw,960px)] p-0 gap-0 flex flex-col overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Week of {fmtDate(weekStart)} – {fmtDate(weekEnd)} · Final Results
          </DialogTitle>
          <DialogDescription>
            {entries.length} player{entries.length !== 1 ? "s" : ""} · Final standings
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto flex-1 p-4">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Trophy className="w-9 h-9 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No picks recorded for this week.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm border-separate border-spacing-0"
                  style={{ minWidth: `${minWidth}px` }}
                >
                  <thead>
                    <tr className="bg-muted/[0.05]">
                      <th className="sticky left-0 z-20 bg-card px-3 py-2 border-b border-border/30 border-r border-border/20 text-left font-bebas text-xs tracking-wider text-muted-foreground/40 min-w-[150px]">
                        Player
                      </th>
                      {days.map((date) => (
                        <th key={date} className="px-1 py-2 text-center border-b border-border/30 font-bold text-[9px] uppercase tracking-wider text-muted-foreground/40 whitespace-nowrap" style={{ width: 44 }}>
                          {dayAbbrev(date)}
                          <div className="text-[8px] font-normal normal-case text-muted-foreground/30">{fmtDate(date)}</div>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right border-b border-border/30 font-bold text-[9px] uppercase tracking-wider text-muted-foreground/40 whitespace-nowrap" style={{ width: 72 }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      const isMe = entry.userId === currentUserId;
                      const isWinner = entry.rank === 1;
                      const breakdownMap = new Map((entry.dailyBreakdown ?? []).map((db: PickEmDailyBreakdown) => [db.date, db]));
                      const pct = entry.picked > 0 ? Math.round((entry.correct / entry.picked) * 100) : null;
                      const isPanelOpen = openCell?.userId === entry.userId;
                      const rowBg = isWinner
                        ? "bg-yellow-500/5"
                        : isMe
                        ? "bg-primary/5"
                        : idx % 2 === 0
                        ? "bg-transparent"
                        : "bg-muted/[0.03]";

                      return (
                        <Fragment key={entry.userId}>
                          <tr className={cn("border-b border-border/10", isPanelOpen && "border-b-0")}>
                            <td className={cn(
                              "sticky left-0 z-20 px-3 py-2.5 border-r border-border/20 min-w-[150px]",
                              isWinner ? "bg-[hsl(48,40%,5%)]" : isMe ? "bg-[hsl(215,50%,7%)]" : "bg-card",
                            )}>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "font-bebas text-base w-5 shrink-0 text-center",
                                  isWinner ? "text-yellow-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-amber-600" : "text-muted-foreground/40",
                                )}>
                                  {isWinner ? "🏆" : entry.rank}
                                </span>
                                <span className={cn("font-medium text-sm truncate", isWinner ? "text-yellow-200" : isMe ? "text-primary" : "text-foreground")}>
                                  {entry.displayName || entry.username}
                                  {isMe && <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>}
                                </span>
                              </div>
                            </td>

                            {days.map((date) => {
                              const day = breakdownMap.get(date);
                              const isCellOpen = isPanelOpen && openCell?.date === date;

                              if (!day) {
                                return (
                                  <td key={date} className={cn("px-0.5 py-1.5 text-center", rowBg)}>
                                    <div className="w-9 h-9 flex items-center justify-center rounded-md border border-border/15 bg-transparent mx-auto">
                                      <span className="text-xs text-muted-foreground/20">—</span>
                                    </div>
                                  </td>
                                );
                              }

                              const allCorrect = day.correct === day.picked && day.picked > 0;
                              const noneCorrect = day.correct === 0 && day.picked > 0;

                              return (
                                <td key={date} className={cn("px-0.5 py-1.5 text-center", rowBg)}>
                                  <button
                                    type="button"
                                    title={`View ${dayAbbrev(date)} picks`}
                                    onClick={() => toggleCell(entry.userId, date)}
                                    className={cn(
                                      "w-9 h-9 flex flex-col items-center justify-center rounded-md border mx-auto transition-all cursor-pointer",
                                      isCellOpen
                                        ? "ring-2 ring-primary/50 border-primary/50 bg-primary/10"
                                        : allCorrect
                                        ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                                        : noneCorrect
                                        ? "bg-red-500/8 border-red-500/20 hover:bg-red-500/15"
                                        : "bg-muted/20 border-border/30 hover:bg-muted/30",
                                    )}
                                  >
                                    <span className={cn(
                                      "font-bebas text-sm leading-none",
                                      isCellOpen ? "text-primary" : allCorrect ? "text-green-400" : noneCorrect ? "text-red-400/70" : "text-foreground",
                                    )}>
                                      {day.correct}
                                    </span>
                                    <span className="text-[8px] text-muted-foreground/50 leading-none">/{day.picked}</span>
                                  </button>
                                </td>
                              );
                            })}

                            <td className={cn("px-3 py-2.5 text-right", rowBg)}>
                              <span className={cn("font-bebas text-xl", isWinner ? "text-yellow-300" : "text-foreground")}>{entry.correct}</span>
                              <span className="font-bebas text-sm text-muted-foreground/40">/{entry.picked}</span>
                              {pct !== null && <div className="text-[10px] text-muted-foreground/50 leading-none">{pct}%</div>}
                            </td>
                          </tr>

                          {isPanelOpen && openCell && (
                            <tr className="border-b border-border/10">
                              <td colSpan={days.length + 2} className="p-0">
                                <DailyPickPanel poolId={poolId} userId={entry.userId} date={openCell.date} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickEmSandboxPanel({ poolId }: { poolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pool } = useGetPool(poolId, {
    query: { queryKey: getGetPoolQueryKey(poolId) },
  });

  const [sandboxWeek, setSandboxWeek] = useState<number>(1);
  const [localSandboxMode, setLocalSandboxMode] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ week: number; graded: number } | null>(null);

  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (pool && initRef.current !== pool.id) {
      initRef.current = pool.id;
      setSandboxWeek((pool as any).sandboxWeek ?? pool.currentWeek);
      setLocalSandboxMode((pool as any).sandboxMode ?? false);
    }
  }, [pool]);

  const handleToggleSandbox = async (enabled: boolean) => {
    setTogglingMode(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/pools/${poolId}/sandbox-mode`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sandboxMode: enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setLocalSandboxMode(enabled);
      toast({
        title: enabled ? "Sandbox enabled" : "Sandbox disabled",
        description: enabled ? "Picks now use the 2025-26 NHL schedule." : "Picks now use the live schedule.",
      });
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
      queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId, undefined) });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to toggle sandbox", description: (err as Error).message });
    } finally {
      setTogglingMode(false);
    }
  };

  const handleLoadSandboxWeek = async () => {
    setLoadingWeek(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/schedule/sandbox-week`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: sandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `Week ${sandboxWeek} loaded`, description: "Game slate updated for sandbox week." });
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
      queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId, undefined) });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load week", description: (err as Error).message });
    } finally {
      setLoadingWeek(false);
    }
  };

  const handleSimulateGrading = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/pickem/simulate-grading`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: sandboxWeek }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setSimResult({ week: data.week, graded: data.graded });
      toast({ title: "Grading complete", description: `${data.graded} picks graded for week ${data.week}.` });
      queryClient.invalidateQueries({ queryKey: getGetPickEmLeaderboardQueryKey(poolId, undefined) });
      queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId, undefined) });
    } catch (err) {
      toast({ variant: "destructive", title: "Simulation failed", description: (err as Error).message });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Card className="border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,rgba(10,14,26,1)_100%)]">
      <CardHeader>
        <CardTitle className="font-bebas text-2xl tracking-wide text-yellow-400 flex items-center gap-2">
          <Zap className="w-5 h-5" /> Sandbox Mode
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Use the 2025-26 NHL regular-season schedule for testing — picks are always unlocked in sandbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-foreground">Enable Sandbox</p>
            <p className="text-xs text-muted-foreground mt-0.5">Serve 2025-26 NHL games instead of live schedule</p>
          </div>
          <Switch checked={localSandboxMode} disabled={togglingMode} onCheckedChange={handleToggleSandbox} />
        </div>
        {localSandboxMode && (
          <>
            <div className="flex items-end gap-3">
              <div className="grid gap-2 flex-1 max-w-[160px]">
                <Label className="font-bebas text-lg tracking-wide text-yellow-300/80">Week (1–26)</Label>
                <Input
                  type="number"
                  min={1}
                  max={26}
                  value={sandboxWeek}
                  onChange={e => setSandboxWeek(Math.min(26, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="bg-background/50 border-yellow-500/20 w-full"
                />
              </div>
              <Button
                onClick={handleLoadSandboxWeek}
                disabled={loadingWeek}
                className="h-10 font-bebas text-lg tracking-wider bg-yellow-600 hover:bg-yellow-500 text-black shrink-0"
              >
                <Play className="w-4 h-4 mr-1.5" />
                {loadingWeek ? "Loading…" : "Load Week"}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSimulateGrading}
                disabled={simulating}
                variant="outline"
                className="font-bebas text-lg tracking-wider border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
              >
                <BarChart3 className="w-4 h-4 mr-1.5" />
                {simulating ? "Grading…" : "Simulate Grading"}
              </Button>
              {simResult && (
                <span className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {simResult.graded} picks graded for week {simResult.week}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              "Load Week" updates the pool's current week so picks target that week's games.
              "Simulate Grading" scores all pending picks against the sandbox schedule's final results.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function PickEmView({ poolId, poolName, poolDescription, commissionerId, inviteCode, sport = "mlb", pickFrequency, isRecurring = true, entryFee }: PickEmViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updatePool = useUpdatePool();
  const [confirmRecurringOpen, setConfirmRecurringOpen] = useState(false);
  const [settingsName, setSettingsName] = useState(poolName);
  const [settingsDesc, setSettingsDesc] = useState(poolDescription ?? "");
  const isWc = sport === "worldcup";
  const is3way = sport === "worldcup" || sport === "intl" || sport === "mls";
  const isWeekly = pickFrequency === "weekly" && !is3way;
  const isCommissioner = commissionerId === user?.id || user?.role === "admin";
  const isMlb = sport === "mlb" && !is3way;
  const isNhl = sport === "nhl" && !is3way;
  const isNhlWeekly = isNhl && isWeekly;
  const isMlsWeekly = sport === "mls" && pickFrequency === "weekly";

  const welcomeKey = `pickem-welcome-dismissed-${poolId}-${user?.id ?? "guest"}`;
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try { return localStorage.getItem(welcomeKey) !== "1"; } catch { return false; }
  });

  function dismissWelcome() {
    try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
    setShowWelcome(false);
  }

  const { data: poolDetail } = useGetPool(poolId, {
    query: { queryKey: getGetPoolQueryKey(poolId), staleTime: 5 * 60 * 1000 },
  });
  const isSandbox = poolDetail?.sandboxMode === true;

  const todayEt = getTodayEt();
  const [selectedDate, setSelectedDate] = useState<string>(() => todayEt);
  const isToday = selectedDate === todayEt;
  const dateParams = isToday ? undefined : { date: selectedDate };

  const yesterdayDate = useMemo(() => offsetDate(todayEt, -1), [todayEt]);
  const [resultsModalDate, setResultsModalDate] = useState<string | null>(null);
  const [weekResultsOpen, setWeekResultsOpen] = useState(false);

  const yesterdayParams = { date: yesterdayDate };
  const { data: yesterdayWinner } = useGetPickEmYesterdayWinner(
    poolId,
    yesterdayParams,
    { query: { queryKey: getGetPickEmYesterdayWinnerQueryKey(poolId, yesterdayParams), enabled: isToday && !isWc, staleTime: 5 * 60 * 1000 } },
  );

  const { data: prevWeekResults } = useGetPickEmPrevWeekResults(poolId, {
    query: {
      queryKey: getGetPickEmPrevWeekResultsQueryKey(poolId),
      enabled: isWeekly,
      staleTime: 10 * 60 * 1000,
    },
  });
  const prevWeekWinner = prevWeekResults?.hasResults && prevWeekResults.entries.length > 0
    ? prevWeekResults.entries[0]
    : null;

  const [localPicks, setLocalPicks] = useState<Map<string, string>>(new Map());

  // Tiebreaker dialog state — MLB
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tbRuns, setTbRuns] = useState("");
  const [tbStrikeouts, setTbStrikeouts] = useState("");
  // Tiebreaker dialog state — NHL
  const [showNhlTiebreaker, setShowNhlTiebreaker] = useState(false);
  const [tbShots, setTbShots] = useState("");
  const [tbPim, setTbPim] = useState("");
  const pendingPicksRef = React.useRef<Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>>([]);
  const pendingDateRef = React.useRef<string | null>(null);

  const {
    data: slate,
    isLoading: gamesLoading,
    isFetching: gamesFetching,
  } = useGetPickEmGames(poolId, dateParams, {
    query: {
      queryKey: getGetPickEmGamesQueryKey(poolId, dateParams),
      refetchInterval: (query) => isToday ? pickRefetchInterval(query.state.data) : false,
    },
  });

  const { data: leaderboard, isLoading: lbLoading } = useGetPickEmLeaderboard(poolId, undefined, {
    query: {
      queryKey: getGetPickEmLeaderboardQueryKey(poolId),
      refetchInterval: () => pickRefetchInterval(slate),
    },
  });

  const submitPicks = useSubmitPickEmPicks();

  // MLS weekly combined view — fetch the full Mon–Sun slate in one request.
  const { data: mlsWeekData, isLoading: mlsWeekLoading } = useGetPickEmWeekGames(poolId, {
    query: {
      queryKey: getGetPickEmWeekGamesQueryKey(poolId),
      enabled: isMlsWeekly,
      refetchInterval: isMlsWeekly ? 60_000 : false,
      staleTime: 30_000,
    },
  });

  // For NHL weekly: fetch the full weekend schedule (both Sat + Sun) so we can
  // show all games on one combined page and derive day labels.
  // For sandbox weekly pools (non-NHL): still fetch so we can land on the first
  // day with games instead of real-world today.
  const { data: scheduleData } = useGetPoolSchedule(poolId, {
    query: {
      queryKey: getGetPoolScheduleQueryKey(poolId),
      enabled: isNhlWeekly || (isSandbox && isWeekly),
      staleTime: 10 * 60 * 1000,
    },
  });

  // NHL weekly combined view — dates for Saturday and Sunday derived from the
  // schedule endpoint. These are the anchor dates used to fetch per-day game
  // slates (including user picks and per-game deadlinePassed) via GET /games.
  const satDate = isNhlWeekly ? (scheduleData?.days?.[0]?.date ?? null) : null;
  const sunDate = isNhlWeekly ? (scheduleData?.days?.[1]?.date ?? null) : null;
  const satDateParams = satDate ? { date: satDate } : undefined;
  const sunDateParams = sunDate ? { date: sunDate } : undefined;

  const { data: satSlate, isLoading: satLoading } = useGetPickEmGames(poolId, satDateParams, {
    query: {
      queryKey: getGetPickEmGamesQueryKey(poolId, satDateParams),
      enabled: isNhlWeekly && !!satDate,
      refetchInterval: (query) => pickRefetchInterval(query.state.data),
    },
  });
  const { data: sunSlate, isLoading: sunLoading } = useGetPickEmGames(poolId, sunDateParams, {
    query: {
      queryKey: getGetPickEmGamesQueryKey(poolId, sunDateParams),
      enabled: isNhlWeekly && !!sunDate,
      refetchInterval: (query) => pickRefetchInterval(query.state.data),
    },
  });

  // One-shot: redirect selectedDate to the first sandbox day with games.
  const sandboxDefaultApplied = useRef(false);
  useEffect(() => {
    if (sandboxDefaultApplied.current) return;
    if (!isSandbox || !scheduleData?.days) return;
    const firstWithGames = scheduleData.days.find((d) => d.games.length > 0);
    if (!firstWithGames) return;
    sandboxDefaultApplied.current = true;
    setSelectedDate(firstWithGames.date);
  }, [isSandbox, scheduleData]);

  // NHL weekly combined view — merge Sat + Sun slates into grouped day objects.
  // Uses scheduleData.days for date/label structure; game content (picks, deadlinePassed)
  // comes from the per-day GET /games slates which include userPickTeamId and per-game state.
  const nhlWeeklyDays = isNhlWeekly
    ? (scheduleData?.days ?? []).map((d) => ({
        date: d.date,
        label: d.label,
        games: d.date === satDate
          ? (satSlate?.games ?? [])
          : d.date === sunDate
            ? (sunSlate?.games ?? [])
            : [],
      }))
    : [];
  const nhlWeeklyAllGames = nhlWeeklyDays.flatMap((d) => d.games);

  // MLS weekly combined view — derive typed day/game arrays from the week-games response.
  const mlsWeeklyDays: MlsWeekGames["days"] = isMlsWeekly ? (mlsWeekData?.days ?? []) : [];
  const mlsWeeklyAllGames = mlsWeeklyDays.flatMap((d) => d.games);

  // Tiebreaker derived values — needs leaderboard.weekEnd for weekly Sunday detection
  const weekSunday = leaderboard?.weekEnd ?? null;
  const isLastDayOfWeek = (isMlb || isNhl) && isWeekly && isToday && weekSunday === todayEt;
  const needsTiebreaker = (isMlb || isNhl) && isToday && (!isWeekly || isLastDayOfWeek);

  useEffect(() => {
    setLocalPicks(new Map());
  }, [selectedDate]);

  useEffect(() => {
    if (!slate?.games) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const game of slate.games) {
        const savedPick = is3way ? game.userPickOption : game.userPickTeamId;
        if (savedPick && !next.has(game.id)) {
          next.set(game.id, savedPick);
        }
      }
      return next;
    });
  }, [slate, is3way]);

  // NHL weekly: hydrate localPicks from Saturday and Sunday slates separately.
  useEffect(() => {
    if (!isNhlWeekly || !satSlate?.games) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const game of satSlate.games) {
        if (game.userPickTeamId && !next.has(game.id)) next.set(game.id, game.userPickTeamId);
      }
      return next;
    });
  }, [isNhlWeekly, satSlate]);

  useEffect(() => {
    if (!isNhlWeekly || !sunSlate?.games) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const game of sunSlate.games) {
        if (game.userPickTeamId && !next.has(game.id)) next.set(game.id, game.userPickTeamId);
      }
      return next;
    });
  }, [isNhlWeekly, sunSlate]);

  // MLS weekly: hydrate localPicks from the week-games response (userPickOption stored per game).
  useEffect(() => {
    if (!isMlsWeekly || !mlsWeekData?.days) return;
    setLocalPicks((prev) => {
      const next = new Map(prev);
      for (const day of mlsWeekData.days) {
        for (const game of day.games) {
          if (game.userPickOption && !next.has(game.id)) next.set(game.id, game.userPickOption);
        }
      }
      return next;
    });
  }, [isMlsWeekly, mlsWeekData]);

  function togglePick(gameId: string, teamId: string) {
    setLocalPicks((prev) => {
      const next = new Map(prev);
      if (next.get(gameId) === teamId) {
        next.delete(gameId);
      } else {
        next.set(gameId, teamId);
      }
      return next;
    });
  }

  function handleSubmit() {
    // NHL weekly combined view: delegate to the multi-day submit path.
    if (isNhlWeekly) {
      void handleNhlWeeklySubmit();
      return;
    }
    // MLS weekly combined view: delegate to the per-day MLS submit path.
    if (isMlsWeekly) {
      void handleMlsWeeklySubmit();
      return;
    }

    if (!slate) return;

    const picks = Array.from(localPicks.entries())
      .map(([gameId, pickValue]) => {
        const game = slate.games.find((g) => g.id === gameId);
        if (!game || game.deadlinePassed) return null;
        if (is3way) {
          const label = WC_PICK_LABELS[pickValue as WcPickOption] ?? pickValue;
          return { gameId, pickedTeamId: pickValue, pickedTeamName: label };
        }
        const team = pickValue === game.awayTeam.id ? game.awayTeam : game.homeTeam;
        return { gameId, pickedTeamId: pickValue, pickedTeamName: team.name };
      })
      .filter(Boolean) as Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;

    if (picks.length === 0) {
      toast({
        title: "No open picks to submit",
        description: "All games may have already started.",
      });
      return;
    }

    // MLB/NHL pools: intercept submit to collect tiebreaker guesses first
    if (needsTiebreaker) {
      pendingPicksRef.current = picks;
      if (isNhl) {
        setTbShots("");
        setTbPim("");
        setShowNhlTiebreaker(true);
      } else {
        setTbRuns("");
        setTbStrikeouts("");
        setShowTiebreaker(true);
      }
      return;
    }

    doFinalSubmit(picks);
  }

  // NHL weekly combined submit: builds per-day pick lists and calls POST /picks
  // once per day (Saturday then Sunday). The tiebreaker intercept fires on Sunday
  // when needsTiebreaker is true; Saturday picks are submitted immediately before
  // the dialog opens so they aren't lost while the user fills in guesses.
  async function handleNhlWeeklySubmit() {
    const satGameIds = new Set((satSlate?.games ?? []).map((g) => g.id));
    const sunGameIds = new Set((sunSlate?.games ?? []).map((g) => g.id));

    function buildDayPicks(gameIds: Set<string>) {
      return Array.from(localPicks.entries())
        .map(([gameId, pickValue]) => {
          if (!gameIds.has(gameId)) return null;
          const game = nhlWeeklyAllGames.find((g) => g.id === gameId);
          if (!game || game.deadlinePassed) return null;
          const team = pickValue === game.awayTeam.id ? game.awayTeam : game.homeTeam;
          return { gameId, pickedTeamId: pickValue, pickedTeamName: team.name };
        })
        .filter(Boolean) as Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;
    }

    const satPicks = buildDayPicks(satGameIds);
    const sunPicks = buildDayPicks(sunGameIds);

    if (satPicks.length === 0 && sunPicks.length === 0) {
      toast({ title: "No open picks to submit", description: "All games may have already started." });
      return;
    }

    // On Sunday (isLastDayOfWeek): intercept to collect tiebreaker before submitting Sunday picks.
    if (needsTiebreaker && sunPicks.length > 0) {
      // Submit Saturday picks immediately (no tiebreaker needed for Saturday).
      if (satPicks.length > 0 && satDate) {
        submitPicks.mutate({ poolId, data: { picks: satPicks, date: satDate } }, {
          onSuccess: () => void invalidatePoolQueries(queryClient, poolId),
          onError: () => toast({ variant: "destructive", title: "Failed to save Saturday picks", description: "Please try again." }),
        });
      }
      pendingPicksRef.current = sunPicks;
      pendingDateRef.current = sunDate;
      setTbShots("");
      setTbPim("");
      setShowNhlTiebreaker(true);
      return;
    }

    // Normal path: submit Saturday then Sunday sequentially.
    let totalSaved = 0;
    if (satPicks.length > 0 && satDate) {
      try {
        const res = await submitPicks.mutateAsync({ poolId, data: { picks: satPicks, date: satDate } });
        totalSaved += res.saved;
      } catch {
        toast({ variant: "destructive", title: "Failed to save picks", description: "Please try again." });
        return;
      }
    }
    if (sunPicks.length > 0 && sunDate) {
      try {
        const res = await submitPicks.mutateAsync({ poolId, data: { picks: sunPicks, date: sunDate } });
        totalSaved += res.saved;
      } catch {
        toast({ variant: "destructive", title: "Failed to save picks", description: "Please try again." });
        return;
      }
    }
    toast({ title: "Picks saved!", description: `${totalSaved} pick${totalSaved !== 1 ? "s" : ""} saved.` });
    void invalidatePoolQueries(queryClient, poolId);
  }

  // MLS weekly combined submit: iterates each day-group, submits open picks per day.
  async function handleMlsWeeklySubmit() {
    let totalSaved = 0;
    for (const day of mlsWeeklyDays) {
      const dayGameIds = new Set(day.games.map((g) => g.id));
      const dayPicks = Array.from(localPicks.entries())
        .map(([gameId, pickValue]) => {
          if (!dayGameIds.has(gameId)) return null;
          const game = day.games.find((g) => g.id === gameId);
          if (!game || game.deadlinePassed) return null;
          const label = WC_PICK_LABELS[pickValue as WcPickOption] ?? pickValue;
          return { gameId, pickedTeamId: pickValue, pickedTeamName: label };
        })
        .filter(Boolean) as Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>;

      if (dayPicks.length === 0) continue;
      try {
        const res = await submitPicks.mutateAsync({ poolId, data: { picks: dayPicks, date: day.date } });
        totalSaved += res.saved;
      } catch {
        toast({ variant: "destructive", title: "Failed to save picks", description: "Please try again." });
        return;
      }
    }
    if (totalSaved === 0) {
      toast({ title: "No open picks to submit", description: "All games may have already started." });
      return;
    }
    toast({ title: "Picks saved!", description: `${totalSaved} pick${totalSaved !== 1 ? "s" : ""} saved.` });
    void invalidatePoolQueries(queryClient, poolId);
  }

  function doFinalSubmit(
    picks: Array<{ gameId: string; pickedTeamId: string; pickedTeamName: string }>,
    tiebreakerRuns?: number,
    tiebreakerStrikeouts?: number,
    tiebreakerShotsOnGoal?: number,
    tiebreakerPenaltyMinutes?: number,
  ) {
    // For NHL weekly: tiebreaker is for Sunday picks; pendingDateRef holds the
    // Sunday date set by handleNhlWeeklySubmit before opening the dialog.
    const submitDate = pendingDateRef.current ?? selectedDate;
    pendingDateRef.current = null;

    submitPicks.mutate(
      {
        poolId,
        data: {
          picks,
          date: submitDate,
          ...(tiebreakerRuns !== undefined && tiebreakerStrikeouts !== undefined
            ? { tiebreakerRuns, tiebreakerStrikeouts }
            : {}),
          ...(tiebreakerShotsOnGoal !== undefined && tiebreakerPenaltyMinutes !== undefined
            ? { tiebreakerShotsOnGoal, tiebreakerPenaltyMinutes }
            : {}),
        },
      },
      {
        onSuccess: (result) => {
          toast({
            title: "Picks saved!",
            description: `${result.saved} pick${result.saved !== 1 ? "s" : ""} saved.`,
          });
          void invalidatePoolQueries(queryClient, poolId);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to save picks", description: "Please try again." });
        },
      },
    );
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteCode);
    toast({ title: "Invite code copied to clipboard!" });
  }

  // Combined view overrides — NHL uses Sat+Sun merged data; MLS uses full week data.
  const openGames = isNhlWeekly
    ? nhlWeeklyAllGames.filter((g) => !g.deadlinePassed)
    : isMlsWeekly
    ? mlsWeeklyAllGames.filter((g) => !g.deadlinePassed)
    : (slate?.games.filter((g) => !g.deadlinePassed) ?? []);
  const lockedGames = isNhlWeekly
    ? nhlWeeklyAllGames.filter((g) => g.deadlinePassed)
    : isMlsWeekly
    ? mlsWeeklyAllGames.filter((g) => g.deadlinePassed)
    : (slate?.games.filter((g) => g.deadlinePassed) ?? []);
  const pendingPickCount = openGames.filter((g) => !localPicks.has(g.id)).length;

  const slateLocked = isNhlWeekly
    ? (scheduleData?.deadlinePassed ?? false)
    : isMlsWeekly
    ? openGames.length === 0 && mlsWeeklyAllGames.length > 0
    : (slate?.deadlinePassed ?? false);
  const myPickCount = isNhlWeekly
    ? nhlWeeklyAllGames.filter((g) => !!g.userPickTeamId).length
    : isMlsWeekly
    ? mlsWeeklyAllGames.filter((g) => !!g.userPickOption).length
    : (slate?.games.filter((g) => is3way ? !!g.userPickOption : !!g.userPickTeamId).length ?? 0);

  const lockTimeFormatted = useMemo(() => {
    const games = isNhlWeekly ? nhlWeeklyAllGames : isMlsWeekly ? mlsWeeklyAllGames : (slate?.games ?? []);
    if (!games.length) return null;
    const firstMs = Math.min(...games.map((g) => new Date(g.startTime).getTime()));
    const lockMs = firstMs - 5 * 60 * 1000;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(lockMs));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNhlWeekly, nhlWeeklyAllGames, isMlsWeekly, mlsWeeklyAllGames, slate]);

  // NHL weekly combined loading/empty — both day slates must resolve before rendering.
  const nhlWeeklyLoading = isNhlWeekly && (!scheduleData || (!!satDate && satLoading) || (!!sunDate && sunLoading));
  const nhlWeeklyEmpty = isNhlWeekly && !nhlWeeklyLoading && nhlWeeklyAllGames.length === 0;
  const nhlWeeklyPoolClosed = isNhlWeekly && (satSlate?.poolClosed ?? false);

  // MLS weekly combined loading/empty.
  const mlsWeeklyLoading = isMlsWeekly && mlsWeekLoading;
  const mlsWeeklyEmpty = isMlsWeekly && !mlsWeeklyLoading && mlsWeeklyAllGames.length === 0;

  return (
    <>
    {resultsModalDate && (
      <DayResultsModal
        open={!!resultsModalDate}
        onClose={() => setResultsModalDate(null)}
        poolId={poolId}
        date={resultsModalDate}
        currentUserId={user?.id ?? 0}
      />
    )}
    {weekResultsOpen && prevWeekResults && (
      <PrevWeekResultsModal
        open={weekResultsOpen}
        onClose={() => setWeekResultsOpen(false)}
        poolId={poolId}
        weekStart={prevWeekResults.weekStart}
        weekEnd={prevWeekResults.weekEnd}
        entries={prevWeekResults.entries}
        currentUserId={user?.id ?? null}
      />
    )}
    {/* MLB Tiebreaker Dialog */}
    <Dialog open={showTiebreaker} onOpenChange={(open) => { if (!open) setShowTiebreaker(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-yellow-400" />
            Tiebreaker Guess
          </DialogTitle>
          <DialogDescription className="space-y-1">
            {(() => {
              const tbGame = slate?.games.find(g => g.isTiebreakerGame) ?? null;
              const gameTime = tbGame?.startTime
                ? new Date(tbGame.startTime).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/New_York",
                    hour12: true,
                  }) + " ET"
                : null;
              return (
                <>
                  {tbGame && (
                    <span className="block text-sm font-semibold text-foreground">
                      {tbGame.awayTeam.name} @ {tbGame.homeTeam.name}
                      {gameTime && <span className="ml-2 text-muted-foreground font-normal">· {gameTime}</span>}
                    </span>
                  )}
                  <span className="block">
                    In case of a tie, the player closest to the actual runs scored and total strikeouts for this game wins.
                  </span>
                </>
              );
            })()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Runs Scored — Tiebreaker Game
            </label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 42"
              value={tbRuns}
              onChange={(e) => setTbRuns(e.target.value)}
              className="text-lg font-mono h-12"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Strikeouts — Tiebreaker Game
            </label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 28"
              value={tbStrikeouts}
              onChange={(e) => setTbStrikeouts(e.target.value)}
              className="text-lg font-mono h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const runs = parseInt(tbRuns, 10);
                  const strikes = parseInt(tbStrikeouts, 10);
                  if (!isNaN(runs) && runs >= 0 && !isNaN(strikes) && strikes >= 0) {
                    setShowTiebreaker(false);
                    doFinalSubmit(pendingPicksRef.current, runs, strikes);
                  }
                }
              }}
            />
          </div>
        </div>
        <DialogFooter className="flex flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setShowTiebreaker(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-bebas text-xl tracking-widest"
            onClick={() => {
              const runs = parseInt(tbRuns, 10);
              const strikes = parseInt(tbStrikeouts, 10);
              if (isNaN(runs) || runs < 0 || isNaN(strikes) || strikes < 0) {
                toast({ variant: "destructive", title: "Enter valid guesses", description: "Both fields are required and must be ≥ 0." });
                return;
              }
              setShowTiebreaker(false);
              doFinalSubmit(pendingPicksRef.current, runs, strikes);
            }}
          >
            Submit Picks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* NHL Tiebreaker Dialog */}
    <Dialog open={showNhlTiebreaker} onOpenChange={(open) => { if (!open) setShowNhlTiebreaker(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-yellow-400" />
            Tiebreaker Guess
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-snug">
            It&apos;s the last day of the week! In case of a tie, your tiebreaker guess decides the winner.
            <br />
            Guess the <strong className="text-foreground">combined shots on goal</strong> and <strong className="text-foreground">total penalty minutes</strong> for the last game on today&apos;s slate. Closest combined error wins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Shots on Goal — Tiebreaker Game
            </label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 58"
              value={tbShots}
              onChange={(e) => setTbShots(e.target.value)}
              className="text-lg font-mono h-12"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Penalty Minutes — Tiebreaker Game
            </label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 12"
              value={tbPim}
              onChange={(e) => setTbPim(e.target.value)}
              className="text-lg font-mono h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const shots = parseInt(tbShots, 10);
                  const pim = parseInt(tbPim, 10);
                  if (!isNaN(shots) && shots >= 0 && !isNaN(pim) && pim >= 0) {
                    setShowNhlTiebreaker(false);
                    doFinalSubmit(pendingPicksRef.current, undefined, undefined, shots, pim);
                  }
                }
              }}
            />
          </div>
        </div>
        <DialogFooter className="flex flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setShowNhlTiebreaker(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 font-bebas text-xl tracking-widest"
            onClick={() => {
              const shots = parseInt(tbShots, 10);
              const pim = parseInt(tbPim, 10);
              if (isNaN(shots) || shots < 0 || isNaN(pim) || pim < 0) {
                toast({ variant: "destructive", title: "Enter valid guesses", description: "Both fields are required and must be ≥ 0." });
                return;
              }
              setShowNhlTiebreaker(false);
              doFinalSubmit(pendingPicksRef.current, undefined, undefined, shots, pim);
            }}
          >
            Submit Picks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Tabs defaultValue="picks" className="w-full">
      <div className="relative">
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList className="bg-card border border-border flex flex-nowrap md:flex-wrap h-auto p-1.5 gap-1 shadow-sm w-max md:w-full">
          <TabsTrigger
            value="picks"
            className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
          >
            <Target className="w-4 h-4 md:w-5 md:h-5" /> Today's Picks
          </TabsTrigger>
          <TabsTrigger
            value="leaderboard"
            className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2"
          >
            <Trophy className="w-4 h-4 md:w-5 md:h-5" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger
            value="grid"
            className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
          >
            <LayoutGrid className="w-4 h-4 md:w-5 md:h-5" /> {is3way ? "Pick Grid" : "Daily Grid"}
          </TabsTrigger>
          {!isWc && (myPickCount > 0 || slateLocked) && (leaderboard?.entries.length ?? 0) > 0 && (
            <TabsTrigger
              value="snapshot"
              className="shrink-0 font-bebas text-base md:text-xl tracking-wider px-3 md:px-5 py-2 md:py-2.5 data-[state=active]:bg-yellow-500/10 data-[state=active]:text-yellow-400 flex gap-2"
            >
              <Camera className="w-4 h-4 md:w-5 md:h-5" /> Snapshot
            </TabsTrigger>
          )}
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
        {/* ── Today's Picks ── */}
        <TabsContent value="picks" className="m-0 focus-visible:outline-none">
          <div className="space-y-6">
            {/* Welcome banner — shown once per user per pool, all sport types */}
            {showWelcome && (
              <div className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 pr-10">
                <span className="text-xl leading-none mt-0.5">🎯</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground leading-snug">
                    Welcome to {poolName}!
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                    {is3way
                      ? sport === "mls"
                        ? "Pick the winner of every MLS match — Home Win, Draw, or Away Win. Most correct picks by end of week wins the prize pot. Each match locks at kickoff. Good luck! ⚽"
                        : "🌍 Welcome to World Cup 2026 Pick-Ems! Pick Home Win, Draw, or Away Win for every group stage match. 💡 Pro tip: Pick all 72 matches now before June 11 kickoff so you never miss a game — you can change any pick until that match kicks off. Most correct picks by July 2 wins the prize pot. Tied players split equally. Postponed matches are voided. Good luck! 🦈⚽"
                      : pickFrequency === "weekly"
                      ? (isNhl
                          ? "Pick the winner of every NHL game on Saturday and Sunday. Picks accumulate over the weekend — whoever has the most correct picks by Sunday wins the prize pot. Each game locks at puck drop. Good luck! 🏒✏️"
                          : "Pick the winner of every MLB game each day. Picks accumulate all week — whoever has the most correct picks by Sunday wins the prize pot. Each game locks at first pitch. Postponed games are voided. Good luck! 🦈⚾")
                      : "Pick the winner of every MLB game today. Whoever has the most correct picks by end of day wins. Each game locks at first pitch. Postponed games are voided. Good luck! 🦈⚾"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissWelcome}
                  className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                  aria-label="Dismiss welcome message"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

          {isWc ? (
            <WcScheduleView poolId={poolId} commissionerId={commissionerId} />
          ) : nhlWeeklyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : nhlWeeklyEmpty ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bebas text-2xl tracking-wide">No games this weekend</p>
              <p className="text-sm mt-1">Check back when the schedule is posted.</p>
            </div>
          ) : isNhlWeekly ? (
            <div className="space-y-6">
              {/* Tiebreaker banner — Sunday only */}
              {isLastDayOfWeek && !slateLocked && (
                <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/8 px-4 py-3">
                  <Shuffle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-yellow-200 leading-snug">
                      Final day of the week — tiebreaker required
                    </p>
                    <p className="text-xs text-yellow-400/70 mt-0.5 leading-snug">
                      When you submit today you&apos;ll be asked to guess combined shots on goal + penalty minutes for the last game on Sunday&apos;s slate.
                    </p>
                  </div>
                </div>
              )}

              {/* Last Week's Winner banner */}
              {prevWeekWinner && prevWeekResults && (
                <div className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3">
                  <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-yellow-200">Last Week&apos;s Winner:</span>
                    <span className="text-sm text-yellow-300">{prevWeekWinner.displayName || prevWeekWinner.username}</span>
                    <span className="text-yellow-500/50 text-xs">·</span>
                    <span className="text-sm text-yellow-400/70">{prevWeekWinner.correct}/{prevWeekWinner.picked} correct</span>
                    {prevWeekWinner.prizeWon != null && (
                      <>
                        <span className="text-yellow-500/50 text-xs">·</span>
                        <span className="text-sm font-semibold text-yellow-300">${prevWeekWinner.prizeWon}</span>
                      </>
                    )}
                    <span className="text-yellow-500/50 text-xs">·</span>
                    <span className="text-xs text-yellow-500/60">
                      {new Date(prevWeekResults.weekStart + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      {" – "}
                      {new Date(prevWeekResults.weekEnd + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWeekResultsOpen(true)}
                    className="text-xs font-medium text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0 whitespace-nowrap"
                  >
                    View Full Results →
                  </button>
                </div>
              )}

              {/* Static weekend header — no day-navigation for combined view */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bebas text-2xl text-foreground tracking-wide leading-none">
                    {scheduleData?.weekLabel ?? "This Weekend"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {nhlWeeklyAllGames.length} game{nhlWeeklyAllGames.length !== 1 ? "s" : ""}
                    {" · "}
                    {localPicks.size} pick{localPicks.size !== 1 ? "s" : ""} selected
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {nhlWeeklyAllGames.some((g) => g.status === "in_progress") ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-red-500/10 text-red-400 border-red-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                      Live · updates every 30s
                    </span>
                  ) : !nhlWeeklyAllGames.every((g) => g.status === "final") && slateLocked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-primary/10 text-primary/70 border-primary/20">
                      <Wifi className="w-2.5 h-2.5" />
                      Auto-updates every min
                    </span>
                  ) : null}
                  {slateLocked && (
                    <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-muted/20 text-muted-foreground/70 border-border/30">
                      Slate Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Pool ended — full takeover */}
              {nhlWeeklyPoolClosed ? (
                <div className="space-y-5">
                  <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
                    <Trophy className="w-16 h-16 text-yellow-500/60 mb-4" />
                    <h3 className="font-bebas text-3xl tracking-widest mb-2 text-muted-foreground/70">POOL ENDED</h3>
                    <p className="text-muted-foreground">Results are final.</p>
                  </div>
                  {leaderboard && leaderboard.entries.length > 0 && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
                        <p className="text-yellow-400/80 font-bebas text-lg tracking-wider mb-2 uppercase">
                          {leaderboard.entries.filter(e => e.correct === leaderboard!.entries[0].correct).length > 1 ? "Co-Winners" : "Winner"}
                        </p>
                        {leaderboard.entries
                          .filter(e => e.correct === leaderboard!.entries[0].correct)
                          .map(w => (
                            <div key={w.userId} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xl">🏆</span>
                              <span className="font-semibold text-foreground text-lg">{w.displayName || w.username}</span>
                              {w.userId === user?.id && <span className="text-xs text-primary/60 font-medium">(you)</span>}
                              <span className="text-muted-foreground text-sm">— {w.correct}/{w.picked} correct</span>
                            </div>
                          ))}
                      </div>
                      <div className="rounded-xl border border-border/40 overflow-hidden">
                        {leaderboard.entries.map((entry, idx) => {
                          const isMe = entry.userId === user?.id;
                          return (
                            <div
                              key={entry.userId}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0",
                                isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                              )}
                            >
                              <span className={cn("font-bebas text-xl w-7 shrink-0 text-center", idx === 0 ? "text-yellow-400" : idx === 1 ? "text-zinc-300" : idx === 2 ? "text-amber-600" : "text-muted-foreground/40")}>
                                {idx + 1}
                              </span>
                              <span className={cn("flex-1 font-medium truncate", isMe ? "text-primary" : "text-foreground")}>
                                {entry.displayName || entry.username}
                                {isMe && <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>}
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="font-bebas text-2xl text-green-400">{entry.correct}</span>
                                <span className="font-bebas text-xl text-muted-foreground/40">/{entry.picked}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Grouped game list: Saturday section then Sunday section */}
                  {nhlWeeklyDays.map((day) => (
                    <div key={day.date} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bebas text-lg tracking-wide text-muted-foreground/80 leading-none">
                          {day.label}
                        </h4>
                        <div className="flex-1 h-px bg-border/30" />
                        <span className="text-xs text-muted-foreground/50">
                          {day.games.length} game{day.games.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {day.games.length === 0 ? (
                        <p className="text-sm text-muted-foreground/50 px-1 py-4 text-center">No games scheduled.</p>
                      ) : (
                        day.games.map((game, idx) => {
                          const isSundaySlot = day.date === sunDate;
                          const showTiebreakerBadge = isSundaySlot && idx === day.games.length - 1 && needsTiebreaker;
                          return (
                            <GameCard
                              key={game.id}
                              game={game}
                              pickedTeamId={localPicks.get(game.id) ?? game.userPickTeamId ?? null}
                              onPick={(teamId) => togglePick(game.id, teamId)}
                              isTiebreakerGame={showTiebreakerBadge}
                            />
                          );
                        })
                      )}
                    </div>
                  ))}

                  {/* Submit bar */}
                  {(isToday || isSandbox) && openGames.length > 0 && (
                    <div className="pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-t border-border/40">
                      <p className="text-sm text-muted-foreground">
                        {pendingPickCount > 0 ? (
                          <span className="text-yellow-400/80">
                            {pendingPickCount} game{pendingPickCount !== 1 ? "s" : ""} without a pick
                          </span>
                        ) : (
                          <span className="text-green-400/80 flex items-center gap-1">
                            <Check className="w-4 h-4" /> All open games picked
                          </span>
                        )}
                      </p>
                      <Button
                        onClick={handleSubmit}
                        disabled={submitPicks.isPending || localPicks.size === 0}
                        className="font-bebas text-xl tracking-widest px-8 h-12"
                      >
                        {submitPicks.isPending ? (
                          <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                        ) : (
                          "Submit Picks"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : mlsWeeklyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : mlsWeeklyEmpty ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">No games scheduled this week</p>
              <p className="text-sm mt-1 text-muted-foreground/60">Check back when the schedule is posted.</p>
            </div>
          ) : isMlsWeekly ? (
            <div className="space-y-6">
              {/* Static week header — no day-navigation for combined view */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bebas text-2xl text-foreground tracking-wide leading-none">
                    This Week
                    {mlsWeekData?.weekStart && mlsWeekData.weekEnd && (
                      <span className="ml-2 font-sans text-sm font-normal text-muted-foreground/70 tracking-normal">
                        {new Date(mlsWeekData.weekStart + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        {" – "}
                        {new Date(mlsWeekData.weekEnd + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mlsWeeklyAllGames.length} game{mlsWeeklyAllGames.length !== 1 ? "s" : ""}
                    {" · "}
                    {localPicks.size} pick{localPicks.size !== 1 ? "s" : ""} selected
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {mlsWeeklyAllGames.some((g) => g.status === "in_progress") ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-red-500/10 text-red-400 border-red-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                      Live · updates every min
                    </span>
                  ) : !mlsWeeklyAllGames.every((g) => g.status === "final") && slateLocked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-primary/10 text-primary/70 border-primary/20">
                      <Wifi className="w-2.5 h-2.5" />
                      Auto-updates every min
                    </span>
                  ) : null}
                  {slateLocked && (
                    <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-muted/20 text-muted-foreground/70 border-border/30">
                      Slate Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Day-grouped game list */}
              {mlsWeeklyDays.map((day) => (
                <div key={day.date} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bebas text-lg tracking-wide text-muted-foreground/80 leading-none">
                      {day.label}
                    </h4>
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-xs text-muted-foreground/50">
                      {day.games.length} game{day.games.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {day.games.map((game) => (
                    <WcGameCard
                      key={game.id}
                      game={game}
                      pickedOption={(localPicks.get(game.id) ?? game.userPickOption ?? null) as WcPickOption | null}
                      onPick={(opt) => togglePick(game.id, opt)}
                    />
                  ))}
                </div>
              ))}

              {/* Submit bar */}
              {openGames.length > 0 && (
                <div className="pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-t border-border/40">
                  <p className="text-sm text-muted-foreground">
                    {pendingPickCount > 0 ? (
                      <span className="text-yellow-400/80">
                        {pendingPickCount} game{pendingPickCount !== 1 ? "s" : ""} without a pick
                      </span>
                    ) : (
                      <span className="text-green-400/80 flex items-center gap-1">
                        <Check className="w-4 h-4" /> All open games picked
                      </span>
                    )}
                  </p>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitPicks.isPending || localPicks.size === 0}
                    className="font-bebas text-xl tracking-widest px-8 h-12"
                  >
                    {submitPicks.isPending ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                    ) : (
                      "Submit Picks"
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : gamesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : !slate || slate.games.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bebas text-2xl tracking-wide">No games today</p>
              <p className="text-sm mt-1">Check back when the schedule is posted.</p>
              <button
                onClick={() => setSelectedDate((d) => offsetDate(d, -1))}
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Yesterday
              </button>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Tiebreaker banner — MLB/NHL Weekly, last day (Sunday) only */}
              {isLastDayOfWeek && !slateLocked && (
                <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/8 px-4 py-3">
                  <Shuffle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-yellow-200 leading-snug">
                      Final day of the week — tiebreaker required
                    </p>
                    <p className="text-xs text-yellow-400/70 mt-0.5 leading-snug">
                      {isNhl
                        ? "When you submit today you'll be asked to guess combined shots on goal + penalty minutes. The last game on today's slate is the tiebreaker reference game."
                        : "When you submit today you'll be asked to guess combined runs scored + total strikeouts. The last game on today's slate is the tiebreaker reference game."}
                    </p>
                  </div>
                </div>
              )}

              {/* Last Week's Winner banner (weekly pools only) */}
              {isWeekly && prevWeekWinner && prevWeekResults && (
                <div className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3">
                  <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-yellow-200">Last Week&apos;s Winner:</span>
                    <span className="text-sm text-yellow-300">{prevWeekWinner.displayName || prevWeekWinner.username}</span>
                    <span className="text-yellow-500/50 text-xs">·</span>
                    <span className="text-sm text-yellow-400/70">{prevWeekWinner.correct}/{prevWeekWinner.picked} correct</span>
                    {prevWeekWinner.prizeWon != null && (
                      <>
                        <span className="text-yellow-500/50 text-xs">·</span>
                        <span className="text-sm font-semibold text-yellow-300">${prevWeekWinner.prizeWon}</span>
                      </>
                    )}
                    <span className="text-yellow-500/50 text-xs">·</span>
                    <span className="text-xs text-yellow-500/60">
                      {new Date(prevWeekResults.weekStart + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      {" – "}
                      {new Date(prevWeekResults.weekEnd + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWeekResultsOpen(true)}
                    className="text-xs font-medium text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0 whitespace-nowrap"
                  >
                    View Full Results →
                  </button>
                </div>
              )}

              {/* Yesterday's Winner banner */}
              {isToday && yesterdayWinner?.hasResults && yesterdayWinner.winners.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3">
                  <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-yellow-200">
                      Yesterday&apos;s Winner{yesterdayWinner.winners.length > 1 ? "s" : ""}:
                    </span>
                    <span className="text-sm text-yellow-300">
                      {yesterdayWinner.winners.map((w) => w.displayName || w.username).join(" & ")}
                    </span>
                    <span className="text-yellow-500/50 text-xs">·</span>
                    <span className="text-sm text-yellow-400/70">
                      {yesterdayWinner.winners[0].correct}/{yesterdayWinner.winners[0].total} correct
                    </span>
                    {yesterdayWinner.winners[0].prizeWon != null && (
                      <>
                        <span className="text-yellow-500/50 text-xs">·</span>
                        <span className="text-sm font-semibold text-yellow-300">${yesterdayWinner.winners[0].prizeWon}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setResultsModalDate(yesterdayDate)}
                    className="text-xs font-medium text-yellow-400/70 hover:text-yellow-300 transition-colors shrink-0 whitespace-nowrap"
                  >
                    View Results →
                  </button>
                </div>
              )}

              {/* Date header with navigation */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedDate((d) => offsetDate(d, -1))}
                    className="p-1.5 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h3 className="font-bebas text-2xl text-foreground tracking-wide leading-none">
                      {slate.label}
                      {isToday && <span className="ml-2 text-sm font-sans font-normal text-primary/50 tracking-normal normal-case">Today</span>}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {slate.games.length} game{slate.games.length !== 1 ? "s" : ""}
                      {isToday && <> · {localPicks.size} pick{localPicks.size !== 1 ? "s" : ""} selected</>}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDate((d) => offsetDate(d, 1))}
                    disabled={isToday}
                    className={cn(
                      "p-1.5 rounded-lg border transition-colors shrink-0",
                      isToday
                        ? "border-border/15 text-muted-foreground/20 cursor-not-allowed bg-transparent"
                        : "border-border/40 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {slate.games.some((g) => g.status === "in_progress") ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-red-500/10 text-red-400 border-red-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                      Live · updates every 30s
                    </span>
                  ) : !slate.games.every((g) => g.status === "final") && slate.deadlinePassed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-primary/10 text-primary/70 border-primary/20">
                      {gamesFetching ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Wifi className="w-2.5 h-2.5" />
                      )}
                      Auto-updates every min
                    </span>
                  ) : null}
                  {slate.deadlinePassed && (
                    <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-full border bg-muted/20 text-muted-foreground/70 border-border/30">
                      Slate Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Pool ended — full takeover replaces slate for non-recurring pools */}
              {slate.poolClosed ? (
                <div className="space-y-5">
                  {/* Header banner */}
                  <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/50 rounded-lg bg-card/30">
                    <Trophy className="w-16 h-16 text-yellow-500/60 mb-4" />
                    <h3 className="font-bebas text-3xl tracking-widest mb-2 text-muted-foreground/70">POOL ENDED</h3>
                    <p className="text-muted-foreground">Results are final.</p>
                  </div>
                  {/* Final results — shown once leaderboard data loads */}
                  {leaderboard && leaderboard.entries.length > 0 && (
                    <div className="space-y-4">
                      {/* Winner(s) banner */}
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
                        <p className="text-yellow-400/80 font-bebas text-lg tracking-wider mb-2 uppercase">
                          {leaderboard.entries.filter(e => e.correct === leaderboard.entries[0].correct).length > 1
                            ? "Co-Winners"
                            : "Winner"}
                        </p>
                        {leaderboard.entries
                          .filter(e => e.correct === leaderboard.entries[0].correct)
                          .map(w => (
                            <div key={w.userId} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xl">🏆</span>
                              <span className="font-semibold text-foreground text-lg">
                                {w.displayName || w.username}
                              </span>
                              {w.userId === user?.id && (
                                <span className="text-xs text-primary/60 font-medium">(you)</span>
                              )}
                              <span className="text-muted-foreground text-sm">
                                — {w.correct}/{w.picked} correct
                              </span>
                            </div>
                          ))}
                        {(entryFee == null || entryFee === 0) && (
                          <span className="inline-block mt-2 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full border border-yellow-500/40 text-yellow-400 bg-yellow-500/10">
                            Free Pool
                          </span>
                        )}
                      </div>
                      {/* Full ranked results list */}
                      <div className="rounded-xl border border-border/40 overflow-hidden">
                        {leaderboard.entries.map((entry, idx) => {
                          const isMe = entry.userId === user?.id;
                          return (
                            <div
                              key={entry.userId}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0",
                                isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                              )}
                            >
                              <span className={cn(
                                "font-bebas text-xl w-7 shrink-0 text-center",
                                idx === 0 ? "text-yellow-400" : idx === 1 ? "text-zinc-300" : idx === 2 ? "text-amber-600" : "text-muted-foreground/40",
                              )}>
                                {idx + 1}
                              </span>
                              <span className={cn("flex-1 font-medium truncate", isMe ? "text-primary" : "text-foreground")}>
                                {entry.displayName || entry.username}
                                {isMe && (
                                  <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">you</span>
                                )}
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="font-bebas text-2xl text-green-400">{entry.correct}</span>
                                <span className="font-bebas text-xl text-muted-foreground/40">/{entry.picked}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* All games in original scheduled-time order — never reorganised */
                <div className="space-y-3">
                  {slate.games.map((game, idx) => {
                    const showTiebreakerBadge = (game.isTiebreakerGame ?? false) && needsTiebreaker;
                    return is3way ? (
                      <WcGameCard
                        key={game.id}
                        game={game}
                        pickedOption={(localPicks.get(game.id) ?? game.userPickOption ?? null) as WcPickOption | null}
                        onPick={(opt) => togglePick(game.id, opt)}
                      />
                    ) : (
                      <GameCard
                        key={game.id}
                        game={game}
                        pickedTeamId={localPicks.get(game.id) ?? game.userPickTeamId ?? null}
                        onPick={(teamId) => togglePick(game.id, teamId)}
                        isTiebreakerGame={showTiebreakerBadge}
                      />
                    );
                  })}
                </div>
              )}

              {(isToday || isSandbox) && openGames.length > 0 && !slate.poolClosed && (
                <div className="pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-t border-border/40">
                  <p className="text-sm text-muted-foreground">
                    {pendingPickCount > 0 ? (
                      <span className="text-yellow-400/80">
                        {pendingPickCount} game{pendingPickCount !== 1 ? "s" : ""} without a pick
                      </span>
                    ) : (
                      <span className="text-green-400/80 flex items-center gap-1">
                        <Check className="w-4 h-4" /> All open games picked
                      </span>
                    )}
                  </p>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitPicks.isPending || localPicks.size === 0}
                    className="font-bebas text-xl tracking-widest px-8 h-12"
                  >
                    {submitPicks.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…
                      </>
                    ) : (
                      "Submit Picks"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
          </div>
        </TabsContent>

        {/* ── Leaderboard (simple standings) ── */}
        <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
          {lbLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : !leaderboard || leaderboard.entries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bebas text-2xl tracking-wide">
                {isWeekly ? "No picks yet this week" : is3way ? "No picks yet" : "No picks yet today"}
              </p>
              <p className="text-sm mt-1">Make picks to appear on the leaderboard.</p>
            </div>
          ) : isWeekly && leaderboard.weekStart && leaderboard.weekEnd ? (
            <div className="space-y-4">
              <WeeklyLeaderboard
                poolId={poolId}
                entries={leaderboard.entries}
                currentUserId={user?.id ?? null}
                weekStart={leaderboard.weekStart}
                weekEnd={leaderboard.weekEnd}
              />
              {isMlb && leaderboard.entries.some((e) => e.tiebreakerRunsGuess != null) && (
                <PickEmTiebreakerCard
                  sport="mlb"
                  actualRuns={leaderboard.tiebreakerActualRuns ?? null}
                  actualStrikeouts={leaderboard.tiebreakerActualStrikeouts ?? null}
                  tiedPlayers={leaderboard.entries
                    .filter((e) => e.tiebreakerRunsGuess != null || e.tiebreakerStrikeoutsGuess != null)
                    .map((e) => ({
                      userId: e.userId,
                      username: e.username,
                      displayName: e.displayName ?? null,
                      tiebreakerRunsGuess: e.tiebreakerRunsGuess ?? null,
                      tiebreakerStrikeoutsGuess: e.tiebreakerStrikeoutsGuess ?? null,
                      tiebreakerRunsDiff: e.tiebreakerRunsDiff ?? null,
                    }))}
                />
              )}
              {isNhl && leaderboard.entries.some((e) => e.tiebreakerShotsOnGoalGuess != null) && (
                <PickEmTiebreakerCard
                  sport="nhl"
                  actualShotsOnGoal={leaderboard.tiebreakerActualShotsOnGoal ?? null}
                  actualPenaltyMinutes={leaderboard.tiebreakerActualPenaltyMinutes ?? null}
                  tiedPlayers={leaderboard.entries
                    .filter((e) => e.tiebreakerShotsOnGoalGuess != null || e.tiebreakerPenaltyMinutesGuess != null)
                    .map((e) => ({
                      userId: e.userId,
                      username: e.username,
                      displayName: e.displayName ?? null,
                      tiebreakerShotsOnGoalGuess: e.tiebreakerShotsOnGoalGuess ?? null,
                      tiebreakerPenaltyMinutesGuess: e.tiebreakerPenaltyMinutesGuess ?? null,
                      tiebreakerNhlDiff: e.tiebreakerNhlDiff ?? null,
                    }))}
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bebas text-2xl tracking-wide text-foreground">
                  {isWc
                    ? leaderboard?.phase === "group_stage" ? "Group Stage Standings"
                      : leaderboard?.phase === "knockout_stage" ? "Knockout Stage Standings"
                      : "Overall Standings"
                    : sport === "intl" ? "Overall Standings"
                    : "Today's Standings"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {leaderboard.entries.length} player{leaderboard.entries.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="rounded-xl border border-border/40 overflow-hidden">
                {leaderboard.entries.map((entry, idx) => {
                  const isMe = entry.userId === user?.id;
                  const denominator = entry.picked;
                  const pct =
                    denominator > 0
                      ? Math.round((entry.correct / denominator) * 100)
                      : null;
                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0",
                        isMe ? "bg-primary/5" : idx % 2 === 0 ? "bg-transparent" : "bg-muted/[0.03]",
                      )}
                    >
                      <span
                        className={cn(
                          "font-bebas text-xl w-7 shrink-0 text-center",
                          entry.rank === 1
                            ? "text-yellow-400"
                            : entry.rank === 2
                              ? "text-zinc-300"
                              : entry.rank === 3
                                ? "text-amber-600"
                                : "text-muted-foreground/40",
                        )}
                      >
                        {entry.rank}
                      </span>
                      <span
                        className={cn(
                          "flex-1 font-medium truncate",
                          isMe ? "text-primary" : "text-foreground",
                        )}
                      >
                        {entry.displayName || entry.username}
                        {isMe && (
                          <span className="ml-1 text-[9px] font-bold uppercase tracking-widest text-primary/50">
                            you
                          </span>
                        )}
                      </span>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <div className="w-28 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500/60 rounded-full transition-all"
                            style={{ width: `${pct ?? 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bebas text-2xl text-green-400">{entry.correct}</span>
                        <span className="font-bebas text-xl text-muted-foreground/40">
                          /{denominator}
                        </span>
                        {pct !== null && (
                          <span className="ml-2 text-xs font-mono text-muted-foreground/60">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* MLB daily tiebreaker card */}
              {isMlb && !isWeekly && leaderboard.entries.some((e) => e.tiebreakerRunsGuess != null) && (
                <PickEmTiebreakerCard
                  actualRuns={leaderboard.tiebreakerActualRuns ?? null}
                  actualStrikeouts={leaderboard.tiebreakerActualStrikeouts ?? null}
                  tiedPlayers={leaderboard.entries
                    .filter((e) => e.tiebreakerRunsGuess != null || e.tiebreakerStrikeoutsGuess != null)
                    .map((e) => ({
                      userId: e.userId,
                      username: e.username,
                      displayName: e.displayName ?? null,
                      tiebreakerRunsGuess: e.tiebreakerRunsGuess ?? null,
                      tiebreakerStrikeoutsGuess: e.tiebreakerStrikeoutsGuess ?? null,
                      tiebreakerRunsDiff: e.tiebreakerRunsDiff ?? null,
                    }))}
                />
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Weekly Grid ── */}
        <TabsContent value="grid" className="m-0 focus-visible:outline-none">
          {lbLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : !leaderboard || leaderboard.entries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bebas text-2xl tracking-wide">{is3way ? "No picks yet" : "No picks yet today"}</p>
              <p className="text-sm mt-1">Submit picks to see the grid.</p>
            </div>
          ) : (
            <PicksGrid
              games={leaderboard.games}
              entries={leaderboard.entries}
              currentUserId={user?.id ?? null}
              week={leaderboard.week}
              isWc={is3way}
              phase={leaderboard.phase}
            />
          )}
        </TabsContent>

        {/* ── Snapshot ── */}
        {!isWc && (myPickCount > 0 || slateLocked) && slate && leaderboard && (
          <TabsContent value="snapshot" className="m-0 focus-visible:outline-none">
            <SnapshotView
              slate={slate}
              entries={leaderboard.entries}
              lbGames={leaderboard.games}
              currentUserId={user?.id ?? null}
              poolName={poolName}
              sport={sport}
            />
          </TabsContent>
        )}

        {isCommissioner && (
          <TabsContent value="commissioner" className="m-0 focus-visible:outline-none">
            <div className="max-w-lg space-y-6">
              <div>
                <h3 className="font-bebas text-2xl tracking-wide mb-1">Commissioner Tools</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your pool and grade completed games.
                </p>
              </div>

              {/* Invite Code */}
              <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden relative">
                <div className="absolute right-0 top-0 bottom-0 w-24 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.08),transparent)] pointer-events-none" />
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="font-bebas text-2xl tracking-wide text-primary mb-0.5">
                      Invite Code
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Share this code to let players join the pool.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
                      {inviteCode}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="lg" onClick={copyInvite} className="font-bebas text-xl tracking-wider">
                        <Copy className="w-5 h-5 mr-2" /> Copy Code
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`);
                          toast({ title: "Invite link copied!", description: "Share it with anyone to let them join." });
                        }}
                      >
                        <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pool Settings */}
              <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
                <h4 className="font-bebas text-2xl tracking-wide flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" /> Pool Settings
                </h4>
                <div className="grid gap-2">
                  <Label className="font-bebas text-lg tracking-wide">Pool Name</Label>
                  <Input
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="bg-background/50"
                    placeholder="Pool name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="font-bebas text-lg tracking-wide">Description</Label>
                  <Textarea
                    value={settingsDesc}
                    onChange={(e) => setSettingsDesc(e.target.value)}
                    className="bg-background/50 resize-none"
                    rows={3}
                    placeholder="Optional description"
                  />
                </div>
                <Button
                  onClick={() => updatePool.mutate({ poolId, data: { name: settingsName, description: settingsDesc } } as any)}
                  disabled={updatePool.isPending}
                  className="font-bebas text-lg tracking-wider"
                >
                  {updatePool.isPending ? "Saving…" : "Save Settings"}
                </Button>
              </div>

              {isNhl && user?.role === "admin" && (
                <PickEmSandboxPanel poolId={poolId} />
              )}

              {/* Stop Recurring — MLB Daily pick-em pools only */}
              {(pickFrequency === "daily" || pickFrequency === "weekly") && (
                isRecurring ? (
                  <Card className="border-destructive/30 bg-[linear-gradient(145deg,rgba(220,38,38,0.05)_0%,rgba(10,14,26,1)_100%)]">
                    <CardHeader>
                      <CardTitle className="font-bebas text-2xl tracking-wide text-destructive flex items-center gap-2">
                        <OctagonX className="w-5 h-5" /> End Recurring Pool
                      </CardTitle>
                      <CardDescription className="text-muted-foreground/80">
                        Stop this pool from auto-generating new days. The current day will complete normally, then the pool closes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AlertDialog open={confirmRecurringOpen} onOpenChange={setConfirmRecurringOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="w-full font-bebas text-xl tracking-wider h-12">
                            <OctagonX className="w-5 h-5 mr-2" /> End Recurring Pool
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>End Recurring Pool?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This pool will finish today's results normally, then stop generating new days.
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bebas text-xl tracking-wider"
                              disabled={updatePool.isPending}
                              onClick={() => {
                                updatePool.mutate({ poolId, data: { isRecurring: false } }, {
                                  onSuccess: () => {
                                    toast({ title: "Pool will end after today", description: "No new days will be generated after the current cycle closes." });
                                    queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
                                    setConfirmRecurringOpen(false);
                                  },
                                  onError: (err: any) => {
                                    toast({ variant: "destructive", title: "Failed", description: (err as Error).message });
                                  },
                                });
                              }}
                            >
                              End Recurring Pool
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-border/30 bg-card">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3 text-muted-foreground">
                        <OctagonX className="w-5 h-5 text-destructive/60 shrink-0 mt-0.5" />
                        <p className="text-sm">This pool will end after the current cycle completes. No new days will be generated.</p>
                      </div>
                    </CardContent>
                  </Card>
                )
              )}

              <CancelPoolButton poolId={poolId} />
            </div>
          </TabsContent>
        )}
      </div>
    </Tabs>
    </>
  );
}
