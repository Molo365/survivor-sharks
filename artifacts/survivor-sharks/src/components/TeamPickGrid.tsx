import { useState } from "react";
import { useGetSportTeams, useGetMyPicks, useSubmitPick, getGetMyPicksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check } from "lucide-react";

type Sport = "nfl" | "mlb" | "nba" | "nhl" | "fifa";
export function TeamPickGrid({ poolId, sport, currentWeek }: { poolId: number, sport: Sport, currentWeek: number }) {
  const { data: teams, isLoading: loadingTeams } = useGetSportTeams(sport, { query: { enabled: !!sport, queryKey: ['teams', sport] } });
  const { data: picks, isLoading: loadingPicks } = useGetMyPicks(poolId, { query: { enabled: !!poolId, queryKey: getGetMyPicksQueryKey(poolId) } });
  
  const submitPick = useSubmitPick();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const pickedTeamIds = picks?.map(p => p.teamId) || [];
  const currentPick = picks?.find(p => p.week === currentWeek);

  const handleSubmit = () => {
    if (!selectedTeam) return;
    submitPick.mutate(
      { poolId, data: { teamId: selectedTeam, week: currentWeek } } as any,
      {
        onSuccess: () => {
          toast({ title: "Pick locked in!" });
          queryClient.invalidateQueries({ queryKey: getGetMyPicksQueryKey(poolId) });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Failed to submit pick", description: err?.message || "Error submitting pick" });
        }
      }
    );
  };

  if (loadingTeams || loadingPicks) {
    return <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
    </div>;
  }

  return (
    <div className="space-y-6">
      {currentPick && (
        <div className="bg-primary/10 border border-primary/50 p-4 rounded-md flex items-center justify-between shadow-[0_0_15px_rgba(30,144,255,0.1)]">
          <div>
            <h3 className="font-bebas text-2xl text-primary tracking-wide">Your Pick for Week {currentWeek}</h3>
            <p className="text-lg font-medium">{currentPick.teamName}</p>
          </div>
          <div className="bg-primary/20 p-2 rounded-full">
            <Check className="w-8 h-8 text-primary" />
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams?.map(team => {
          const isPicked = pickedTeamIds.includes(team.id) && currentPick?.teamId !== team.id;
          const isSelected = selectedTeam === team.id || currentPick?.teamId === team.id;
          
          let logoUrl = team.logoUrl;
          if (!logoUrl) {
            if (sport.toLowerCase() === 'fifa') {
              logoUrl = `https://flagcdn.com/w80/${team.id.toLowerCase()}.png`;
            } else {
              logoUrl = `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/${team.abbreviation.toLowerCase()}.png`;
            }
          }

          return (
            <div 
              key={team.id}
              onClick={() => !isPicked && setSelectedTeam(team.id)}
              className={`relative cursor-pointer rounded-lg border p-4 flex flex-col items-center justify-center transition-all min-h-[140px] ${
                isPicked 
                  ? 'opacity-40 grayscale border-border cursor-not-allowed bg-muted/10' 
                  : isSelected 
                    ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(30,144,255,0.2)]' 
                    : 'border-border/50 hover:border-primary/50 bg-card hover:bg-card/80'
              }`}
              data-testid={`team-card-${team.id}`}
            >
              {logoUrl ? (
                <div className="rounded-full bg-white/90 p-2 shadow-sm mb-3">
                  <img src={logoUrl} alt={team.name} className="w-16 h-16 object-contain" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-3 font-bebas text-xl text-muted-foreground">
                  {team.abbreviation}
                </div>
              )}
              <span className="text-center font-medium text-sm leading-tight">{team.name}</span>
              {isPicked && <span className="absolute top-2 right-2 text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded uppercase">Used</span>}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-6 border-t border-border/50">
        <Button 
          onClick={handleSubmit} 
          disabled={!selectedTeam || selectedTeam === currentPick?.teamId || submitPick.isPending}
          className="font-bebas text-xl px-10 h-14 tracking-widest"
          data-testid="button-submit-pick"
        >
          {submitPick.isPending ? "SUBMITTING..." : currentPick ? "UPDATE PICK" : "LOCK IN PICK"}
        </Button>
      </div>
    </div>
  );
}
