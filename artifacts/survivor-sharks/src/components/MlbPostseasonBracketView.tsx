import { useEffect, useMemo, useState } from "react";
import {
  getGetMlbBracketLeaderboardQueryKey,
  getGetMlbBracketQueryKey,
  getGetMlbBracketMemberPicksQueryKey,
  useGetMlbBracket,
  useGetMlbBracketLeaderboard,
  useGetMlbBracketMemberPicks,
  useSimulateMlbBracketFull,
  useSimulateMlbBracketNextRound,
  useSubmitMlbBracketPicks,
} from "@workspace/api-client-react";
import type { MlbBracketPickInput, MlbBracketPickInputSeriesId, MlbBracketStateRoundsItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Check, Loader2, Lock, Save, ShieldAlert, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { InviteCodeCard } from "@/components/InviteCodeCard";

const ROUND_LABELS: Record<string, string> = {
  wild_card: "Wild Card",
  division_series: "Division Series",
  league_championship: "League Championship",
  world_series: "World Series",
};
const ROUND_ORDER = ["wild_card", "division_series", "league_championship", "world_series"];
const SLOT_FEEDERS: Record<string, string[]> = {
  AL_DS_1: ["AL_WC_2"],
  AL_DS_2: ["AL_WC_1"],
  NL_DS_1: ["NL_WC_2"],
  NL_DS_2: ["NL_WC_1"],
  ALCS: ["AL_DS_1", "AL_DS_2"],
  NLCS: ["NL_DS_1", "NL_DS_2"],
  WORLD_SERIES: ["ALCS", "NLCS"],
};

type Pick = { predictedWinner: string; predictedLength: number };
type Leader = { userId: number; username?: string; displayName?: string; rank?: number; points?: number; correctLengths?: number };
type MemberPick = { seriesId: string; round?: string; seriesSlot?: string; predictedWinner: string; predictedLength: number };

function memberPickRows(value: unknown): MemberPick[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "picks" in value && Array.isArray(value.picks)
      ? value.picks
      : [];
  return records.flatMap((record): MemberPick[] => {
    if (!record || typeof record !== "object") return [];
    const pick = record as Record<string, unknown>;
    return typeof pick.seriesId === "string" && typeof pick.predictedWinner === "string" && typeof pick.predictedLength === "number"
      ? [{ seriesId: pick.seriesId, round: typeof pick.round === "string" ? pick.round : undefined, seriesSlot: typeof pick.seriesSlot === "string" ? pick.seriesSlot : undefined, predictedWinner: pick.predictedWinner, predictedLength: pick.predictedLength }]
      : [];
  });
}

function SeriesCard({ series, pick, eligibleTeams, teamLogos, editable, onPick }: { series: MlbBracketStateRoundsItem; pick?: Pick; eligibleTeams: string[]; teamLogos: Record<string, string | null>; editable: boolean; onPick: (pick: Pick) => void }) {
  const unresolved = !series.team1 || !series.team2;
  const matchupTeams = unresolved ? [] : [series.team1!, series.team2!];
  const choiceTeams = unresolved ? eligibleTeams : matchupTeams;
  const hasCompleteChoice = choiceTeams.length === 2;
  const winnerOptions = hasCompleteChoice ? choiceTeams.map((team) => (
    <button key={team} type="button" disabled={!editable} data-testid={`button-mlb-winner-${series.seriesId}-${team}`}
      onClick={() => onPick({ predictedWinner: team, predictedLength: pick?.predictedLength ?? series.allowedLengths[0] })}
      className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left font-bebas tracking-wide transition-colors", pick?.predictedWinner === team ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary/40" : "border-border/50 bg-card hover:border-primary/50", !editable && "cursor-default opacity-70")}>
      {(team === series.team1 ? series.team1LogoUrl : team === series.team2 ? series.team2LogoUrl : teamLogos[team]) && (
        <img
          src={(team === series.team1 ? series.team1LogoUrl : team === series.team2 ? series.team2LogoUrl : teamLogos[team])!}
          alt=""
          className="h-8 w-8 shrink-0 object-contain"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      )}
      <span className="flex-1">{team}</span>
      {series.completed && series.winner === team && <Check className="w-4 h-4 shrink-0 text-green-400" />}
    </button>
  )) : null;
  const lengthPicker = (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Series length</p>
      <div className="flex gap-1.5">
        {series.allowedLengths.map((length) => <button key={length} type="button" disabled={!editable} data-testid={`button-mlb-length-${series.seriesId}-${length}`}
          onClick={() => onPick({ predictedWinner: pick?.predictedWinner ?? "", predictedLength: length })}
          className={cn("flex-1 rounded-md border py-1.5 text-sm font-bold", pick?.predictedLength === length ? "border-primary bg-primary/15 text-primary" : "border-border/40 text-muted-foreground", !editable && "cursor-default")}>{length}</button>)}
      </div>
    </div>
  );
  return (
    <Card className={cn("shark-card border overflow-hidden", unresolved && "border-muted/30 bg-muted/10")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-widest text-muted-foreground">{series.seriesSlot.replaceAll("_", " ")}</span>
          <span className="text-primary font-semibold">{series.points} pt{series.points === 1 ? "" : "s"}</span>
        </div>
        {unresolved ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span><span className="font-semibold text-muted-foreground">Actual matchup: TBD</span><span className="text-muted-foreground/70"> · not yet determined</span></span>
            </div>
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Your prediction</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Choose the team you project to advance.</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">{winnerOptions}</div>
              {lengthPicker}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-1.5">{winnerOptions}</div>
            {lengthPicker}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MlbPostseasonBracketView({ poolId, isCommissioner, inviteCode, sandboxMode, isActive }: { poolId: number; isCommissioner: boolean; inviteCode?: string | null; sandboxMode: boolean; isActive: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useGetMlbBracket(poolId, { query: { queryKey: getGetMlbBracketQueryKey(poolId), staleTime: 0 } });
  const { data: rawLeaderboard, isLoading: leaderboardLoading } = useGetMlbBracketLeaderboard(poolId, { query: { queryKey: getGetMlbBracketLeaderboardQueryKey(poolId) } });
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [member, setMember] = useState<Leader | null>(null);
  const memberPicks = useGetMlbBracketMemberPicks(poolId, member?.userId ?? 0, { query: { enabled: !!member, queryKey: getGetMlbBracketMemberPicksQueryKey(poolId, member?.userId ?? 0) } });
  useEffect(() => {
    if (!data) return;
    setPicks(Object.fromEntries(data.rounds.flatMap((series) => {
      const pick = series.pick;
      return pick?.predictedWinner && typeof pick.predictedLength === "number"
        ? [[series.seriesId, { predictedWinner: pick.predictedWinner, predictedLength: pick.predictedLength }]]
        : [];
    })));
  }, [data]);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetMlbBracketQueryKey(poolId) }),
    queryClient.invalidateQueries({ queryKey: getGetMlbBracketLeaderboardQueryKey(poolId) }),
  ]);
  const submit = useSubmitMlbBracketPicks({ mutation: { onSuccess: () => { void refresh(); toast({ title: "Bracket submitted", description: "All 11 postseason predictions have been saved." }); }, onError: () => toast({ title: "Could not save bracket", description: "Please review your picks and try again.", variant: "destructive" }) } });
  const simulateNext = useSimulateMlbBracketNextRound({ mutation: { onSuccess: () => { void refresh(); toast({ title: "Round advanced" }); }, onError: () => toast({ title: "Simulation failed", variant: "destructive" }) } });
  const simulateFull = useSimulateMlbBracketFull({ mutation: { onSuccess: () => { void refresh(); toast({ title: "Bracket completed and graded" }); }, onError: () => toast({ title: "Simulation failed", variant: "destructive" }) } });
  const rounds = useMemo(() => data?.rounds ?? [], [data]);
  const eligibleTeamsBySlot = useMemo(() => Object.fromEntries(rounds.map((series) => {
    const projectedFeeders = (SLOT_FEEDERS[series.seriesId] ?? [])
      .map((feeder) => picks[feeder]?.predictedWinner)
      .filter((team): team is string => Boolean(team));
    return [series.seriesId, [...new Set([...(series.eligibleTeams ?? []), ...projectedFeeders])]];
  })), [picks, rounds]);
  const pickedCount = rounds.filter(s => picks[s.seriesId]?.predictedWinner && picks[s.seriesId]?.predictedLength).length;
  const leaderboard = (Array.isArray(rawLeaderboard) ? rawLeaderboard : []) as Leader[];
  const memberRows = memberPickRows(memberPicks.data);
  if (isLoading) return <div className="grid md:grid-cols-2 gap-4">{Array.from({ length: 11 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>;
  if (error) return <Card className="border-destructive/30"><CardContent className="p-8 text-center text-muted-foreground">Unable to load this postseason bracket. Please try again.</CardContent></Card>;
  if (!data || rounds.length === 0) return <Card><CardContent className="p-10 text-center"><Trophy className="w-9 h-9 mx-auto mb-3 text-muted-foreground/50" /><p className="font-bebas text-2xl">Bracket unavailable</p><p className="text-sm text-muted-foreground mt-1">Bracket opens once the playoff field is set.</p></CardContent></Card>;
  const saving = submit.isPending;
  const editable = isActive && !data.isLocked;
  return <Tabs defaultValue="picks">
    <TabsList className="bg-card border border-border h-auto p-1.5 gap-1">
      <TabsTrigger value="picks" data-testid="tab-mlb-bracket-picks"><Trophy className="w-4 h-4 mr-1.5" />Postseason Bracket</TabsTrigger>
      <TabsTrigger value="leaderboard" data-testid="tab-mlb-bracket-leaderboard"><Activity className="w-4 h-4 mr-1.5" />Leaderboard</TabsTrigger>
      {isCommissioner && <TabsTrigger value="commissioner" data-testid="tab-mlb-bracket-commissioner"><ShieldAlert className="w-4 h-4 mr-1.5" />Commissioner</TabsTrigger>}
    </TabsList>
    <TabsContent value="picks" className="mt-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div><p className="font-bebas text-xl tracking-wide">Complete your full bracket</p><p className="text-sm text-muted-foreground">{pickedCount} of 11 series selected. Winner points total 22; correct lengths break ties.</p></div>
        <Button data-testid="button-submit-mlb-bracket" disabled={!editable || pickedCount !== rounds.length || saving} onClick={() => submit.mutate({ poolId, data: { picks: rounds.map((series) => ({ seriesId: series.seriesId as MlbBracketPickInputSeriesId, predictedWinner: picks[series.seriesId].predictedWinner, predictedLength: picks[series.seriesId].predictedLength } satisfies MlbBracketPickInput)) } })}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}Submit bracket
        </Button>
      </div>
      {data.isLocked ? <p data-testid="status-mlb-bracket-locked" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">This bracket is locked. Picks can no longer be changed.</p> : !isActive && <p data-testid="status-mlb-bracket-closed" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">This bracket is closed. Picks and results are shown below.</p>}
      {ROUND_ORDER.map(round => { const cards = rounds.filter(s => s.round === round); return cards.length ? <section key={round}><h2 className="font-bebas text-2xl tracking-wider mb-3">{ROUND_LABELS[round]}</h2><div className="grid lg:grid-cols-2 gap-4">{cards.map(s => <SeriesCard key={s.seriesId} series={s} pick={picks[s.seriesId]} eligibleTeams={eligibleTeamsBySlot[s.seriesId] ?? []} teamLogos={data.teamLogos} editable={editable} onPick={pick => setPicks(prev => ({ ...prev, [s.seriesId]: pick }))} />)}</div></section> : null; })}
    </TabsContent>
    <TabsContent value="leaderboard" className="mt-6 space-y-2">{leaderboardLoading ? <Skeleton className="h-44" /> : leaderboard.length === 0 ? <Card><CardContent className="p-10 text-center text-muted-foreground">No brackets submitted yet.</CardContent></Card> : leaderboard.map((entry, index) => <button type="button" key={entry.userId} data-testid={`button-mlb-member-${entry.userId}`} onClick={() => setMember(entry)} className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 text-left hover:border-primary/40"><span className="font-bebas text-xl text-primary w-8">#{entry.rank ?? index + 1}</span><span className="flex-1 font-semibold">{entry.displayName ?? entry.username ?? "Member"}</span><span className="text-right"><b className="text-accent">{entry.points ?? 0}</b><span className="text-xs text-muted-foreground"> pts</span></span></button>)}</TabsContent>
    {isCommissioner && <TabsContent value="commissioner" className="mt-6"><div className="space-y-6"><InviteCodeCard inviteCode={inviteCode} />{sandboxMode && <Card><CardContent className="p-5"><h3 className="font-bebas text-xl tracking-wide mb-1">Sandbox controls</h3><p className="text-sm text-muted-foreground mb-4">Advance the next full round or grade the entire postseason.</p><div className="flex flex-wrap gap-3"><Button data-testid="button-simulate-mlb-next" variant="outline" disabled={simulateNext.isPending || simulateFull.isPending} onClick={() => simulateNext.mutate({ poolId })}>Simulate next round</Button><Button data-testid="button-simulate-mlb-full" disabled={simulateNext.isPending || simulateFull.isPending} onClick={() => simulateFull.mutate({ poolId })}>Simulate full bracket</Button></div></CardContent></Card>}</div></TabsContent>}
    {member && <Dialog open onOpenChange={open => !open && setMember(null)}><DialogContent><DialogHeader><DialogTitle>{member.displayName ?? member.username}'s bracket</DialogTitle></DialogHeader>{memberPicks.isLoading ? <Skeleton className="h-40" /> : memberRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No submitted picks are available.</p> : <div className="max-h-80 space-y-4 overflow-auto">{ROUND_ORDER.map((round) => { const picksForRound = memberRows.filter((pick) => pick.round === round); return picksForRound.length ? <section key={round}><h3 className="font-bebas tracking-wide text-muted-foreground">{ROUND_LABELS[round]}</h3><div className="mt-2 space-y-2">{picksForRound.map((pick) => <div key={pick.seriesId} className="flex items-center justify-between rounded-lg border border-border/50 bg-card p-3"><span className="font-semibold">{pick.seriesSlot?.replaceAll("_", " ") ?? pick.seriesId}</span><span className="text-right text-sm"><b className="text-primary">{pick.predictedWinner}</b><span className="block text-xs text-muted-foreground">in {pick.predictedLength}</span></span></div>)}</div></section> : null; })}</div>}</DialogContent></Dialog>}
  </Tabs>;
}