import React, { useState, useEffect } from "react";
import {
  useGetPickEmGames,
  useSubmitPickEmPicks,
  useGetPickEmLeaderboard,
  useProcessPickEmResults,
  getGetPickEmGamesQueryKey,
  getGetPickEmLeaderboardQueryKey,
} from "@workspace/api-client-react";
import type { PickEmGame, PickEmSlate, PickEmLeaderboardGame, PickEmLeaderboardEntry, PickEmPlayerPick } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { WcScheduleView } from "@/components/WcScheduleView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, ShieldAlert, Clock, Check, X, Trophy, RefreshCw, Copy, Wifi, LayoutGrid, BarChart2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

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
  commissionerId: number;
  inviteCode: string;
  sport?: string;
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
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isLocked = game.deadlinePassed || isLive;

  const result = pickedOption ? game.userPickResult : null;
  const isCorrect = result === "correct";
  const isWrong = result === "incorrect";

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
}

function GameCard({ game, pickedTeamId, onPick }: GameCardProps) {
  const isFinal = game.status === "final";
  const isLive = game.status === "in_progress";
  const isLocked = game.deadlinePassed || isLive;

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
        <span className={cn("font-bebas tracking-wide text-base sm:text-lg leading-tight", isPicked ? "text-foreground" : "text-muted-foreground")}>
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-400 flex items-center gap-0.5">
                <Check className="w-3 h-3" /> Correct
              </span>
            ) : isWrong ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-destructive/80">
                ✗ Wrong
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
        : "border-border/40",
    )}>
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
      <div className="flex items-stretch gap-0">
        {teamBtn(game.awayTeam, "away", game.awayScore, game.awayRecord, game.awayPitcher)}

        {/* Center divider */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[48px] sm:px-3 sm:min-w-[64px]">
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
          ) : (
            <>
              <span className="font-bebas text-[10px] text-muted-foreground/50 tracking-widest uppercase">
                vs
              </span>
              <div className="flex items-center gap-0.5 mt-0.5">
                <Clock className="w-2.5 h-2.5 text-primary/50 shrink-0" />
                <span className="text-[9px] text-muted-foreground/60 leading-tight font-medium whitespace-nowrap">
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
          <table className="w-full text-sm border-collapse" style={{ minWidth: `${Math.max(400, 220 + games.length * (isWc ? 68 : 72))}px` }}>
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
                      "border-b border-border/20 last:border-0",
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
                          {entry.displayName ?? entry.username}
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
                      if (!pick) {
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
        e.picks.some((p) => p.gameId === game.id && p.pickedTeamId === game.awayTeam.id),
      ).length;
      const homeCount = entries.filter((e) =>
        e.picks.some((p) => p.gameId === game.id && p.pickedTeamId === game.homeTeam.id),
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
                    {entry.displayName ?? entry.username}
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

export function PickEmView({ poolId, poolName, commissionerId, inviteCode, sport = "mlb" }: PickEmViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isWc = sport === "worldcup";
  const is3way = sport === "worldcup" || sport === "intl";
  const isCommissioner = commissionerId === user?.id || user?.role === "admin";

  const welcomeKey = `pickem-welcome-dismissed-${poolId}-${user?.id ?? "guest"}`;
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try { return localStorage.getItem(welcomeKey) !== "1"; } catch { return false; }
  });

  function dismissWelcome() {
    try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
    setShowWelcome(false);
  }

  const [localPicks, setLocalPicks] = useState<Map<string, string>>(new Map());

  const {
    data: slate,
    isLoading: gamesLoading,
    isFetching: gamesFetching,
  } = useGetPickEmGames(poolId, {
    query: {
      queryKey: getGetPickEmGamesQueryKey(poolId),
      refetchInterval: (query) => pickRefetchInterval(query.state.data),
    },
  });

  const { data: leaderboard, isLoading: lbLoading } = useGetPickEmLeaderboard(poolId, undefined, {
    query: {
      queryKey: getGetPickEmLeaderboardQueryKey(poolId),
      refetchInterval: () => pickRefetchInterval(slate),
    },
  });

  const submitPicks = useSubmitPickEmPicks();
  const processResults = useProcessPickEmResults();

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

    submitPicks.mutate(
      { poolId, data: { picks } },
      {
        onSuccess: (result) => {
          toast({
            title: "Picks saved!",
            description: `${result.saved} pick${result.saved !== 1 ? "s" : ""} saved.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId) });
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

  function handleProcessResults() {
    processResults.mutate(
      { poolId },
      {
        onSuccess: (result) => {
          toast({
            title: "Results processed",
            description: `${result.processed} pick${result.processed !== 1 ? "s" : ""} graded.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetPickEmGamesQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetPickEmLeaderboardQueryKey(poolId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to process results" });
        },
      },
    );
  }

  const openGames = slate?.games.filter((g) => !g.deadlinePassed) ?? [];
  const lockedGames = slate?.games.filter((g) => g.deadlinePassed) ?? [];
  const pendingPickCount = openGames.filter((g) => !localPicks.has(g.id)).length;

  return (
    <Tabs defaultValue="picks" className="w-full">
      <TabsList className="bg-card border border-border flex flex-wrap h-auto p-1.5 gap-1 shadow-sm">
        <TabsTrigger
          value="picks"
          className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
        >
          <Target className="w-5 h-5" /> Today's Picks
        </TabsTrigger>
        <TabsTrigger
          value="leaderboard"
          className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent flex gap-2"
        >
          <Trophy className="w-5 h-5" /> Leaderboard
        </TabsTrigger>
        <TabsTrigger
          value="grid"
          className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex gap-2"
        >
          <LayoutGrid className="w-5 h-5" /> {is3way ? "Pick Grid" : "Daily Grid"}
        </TabsTrigger>
        <TabsTrigger
          value="stats"
          className="font-bebas text-xl tracking-wider px-5 py-2.5 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-400 flex gap-2"
        >
          <BarChart2 className="w-5 h-5" /> Stats
        </TabsTrigger>
        {isCommissioner && (
          <TabsTrigger
            value="commissioner"
            className="font-bebas text-xl tracking-wider px-5 py-2.5 text-muted-foreground hover:text-foreground ml-auto flex gap-2"
          >
            <ShieldAlert className="w-5 h-5" /> Commissioner
          </TabsTrigger>
        )}
      </TabsList>

      <div className="mt-8">
        {/* ── Today's Picks ── */}
        <TabsContent value="picks" className="m-0 focus-visible:outline-none">
          {isWc ? (
            <WcScheduleView poolId={poolId} commissionerId={commissionerId} />
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
            </div>
          ) : (
            <div className="space-y-6">
              {/* Welcome banner — shown once per user per pool */}
              {showWelcome && (
                <div className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 pr-10">
                  <span className="text-xl leading-none mt-0.5">🎯</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground leading-snug">
                      Welcome to {poolName}!
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                      Pick the winner of each game below. The player with the most correct picks at the end of the day wins. Good luck!
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

              {/* Date header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bebas text-2xl text-foreground tracking-wide">{slate.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {slate.games.length} game{slate.games.length !== 1 ? "s" : ""} ·{" "}
                    {localPicks.size} pick{localPicks.size !== 1 ? "s" : ""} selected
                  </p>
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

              {/* All games in original scheduled-time order — never reorganised */}
              <div className="space-y-3">
                {slate.games.map((game) =>
                  is3way ? (
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
                    />
                  )
                )}
              </div>

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
              <p className="font-bebas text-2xl tracking-wide">{is3way ? "No picks yet" : "No picks yet today"}</p>
              <p className="text-sm mt-1">Make picks to appear on the leaderboard.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bebas text-2xl tracking-wide text-foreground">
                  {isWc && leaderboard?.phase
                    ? leaderboard.phase === "group_stage" ? "Group Stage Standings" : "Knockout Stage Standings"
                    : sport === "intl" ? "All-Time Standings"
                    : "Today's Standings"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {leaderboard.entries.length} player{leaderboard.entries.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="rounded-xl border border-border/40 overflow-hidden">
                {leaderboard.entries.map((entry, idx) => {
                  const isMe = entry.userId === user?.id;
                  const denominator = isWc ? (leaderboard.completedGames ?? 0) : entry.picked;
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
                        {entry.displayName ?? entry.username}
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

        {/* ── Stats ── */}
        <TabsContent value="stats" className="m-0 focus-visible:outline-none">
          {lbLoading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <StatsView
              games={leaderboard?.games ?? []}
              entries={leaderboard?.entries ?? []}
              currentUserId={user?.id ?? null}
              isWc={isWc}
            />
          )}
        </TabsContent>

        {/* ── Commissioner ── */}
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
                    <Button size="lg" onClick={copyInvite} className="font-bebas text-xl tracking-wider">
                      <Copy className="w-5 h-5 mr-2" /> Copy Code
                    </Button>
                  </div>
                </div>
              </div>

              {/* Process Results */}
              <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
                <div>
                  <h4 className="font-bebas text-xl tracking-wide text-foreground mb-1">
                    Process Today's Results
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Fetches final scores from ESPN and marks each pick as correct or incorrect. Safe
                    to run multiple times — only final games are graded.
                  </p>
                </div>
                <Button
                  onClick={handleProcessResults}
                  disabled={processResults.isPending}
                  variant="outline"
                  className="font-bebas text-lg tracking-widest"
                >
                  {processResults.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing…
                    </>
                  ) : (
                    "Process Results"
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
