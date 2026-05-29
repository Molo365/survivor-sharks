import { useState, useRef, useEffect } from "react";
import { useGetPool, useUpdatePool, useProcessResults, getGetPoolQueryKey, getGetResultsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, AlertTriangle, Settings2, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function CommissionerPanel({ poolId }: { poolId: number }) {
  const { data: pool, isLoading: loadingPool } = useGetPool(poolId, { query: { enabled: !!poolId, queryKey: getGetPoolQueryKey(poolId) } });
  
  const updatePool = useUpdatePool();
  const processResults = useProcessResults();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [week, setWeek] = useState<number>(1);
  const [losingTeams, setLosingTeams] = useState<string>("");
  const [processingWeek, setProcessingWeek] = useState<number>(1);

  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (pool && initRef.current !== pool.id) {
      initRef.current = pool.id;
      setName(pool.name);
      setDesc(pool.description || "");
      setWeek(pool.currentWeek);
      setProcessingWeek(pool.currentWeek);
    }
  }, [pool]);

  const handleUpdate = () => {
    updatePool.mutate(
      { poolId, data: { name, description: desc, currentWeek: week } } as any,
      {
        onSuccess: () => {
          toast({ title: "Settings Saved", description: "Pool configuration updated successfully." });
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
        }
      }
    );
  };

  const handleProcess = () => {
    const ids = losingTeams.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return;

    processResults.mutate(
      { poolId, data: { week: processingWeek, losingTeamIds: ids } } as any,
      {
        onSuccess: (res) => {
          toast({ 
            title: "Results Processed", 
            description: `${res.eliminated.length} eliminated, ${res.survived.length} survived.` 
          });
          queryClient.invalidateQueries({ queryKey: getGetResultsQueryKey(poolId) });
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
          setLosingTeams("");
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Failed to process", description: err?.message || "An error occurred" });
        }
      }
    );
  };

  const copyInvite = () => {
    if (pool?.inviteCode) {
      navigator.clipboard.writeText(pool.inviteCode);
      toast({ title: "Invite code copied to clipboard!" });
    }
  };

  if (loadingPool || !pool) return <Skeleton className="h-[400px] w-full" />;

  return (
    <div className="space-y-8 max-w-4xl">
      <Card className="bg-card border-border/50 overflow-hidden relative">
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-[radial-gradient(ellipse_at_right,rgba(30,144,255,0.1),transparent)] pointer-events-none" />
        <CardHeader>
          <CardTitle className="font-bebas text-3xl tracking-wide text-primary">Invite Code</CardTitle>
          <CardDescription>Share this code to let sharks into the pool.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
              {pool.inviteCode}
            </div>
            <Button size="lg" onClick={copyInvite} className="font-bebas text-xl tracking-wider" data-testid="button-copy-invite">
              <Copy className="w-5 h-5 mr-2" /> Copy Code
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-muted-foreground" /> Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide">Pool Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background/50 border-border" />
            </div>
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide">Description</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-background/50 border-border min-h-[100px]" />
            </div>
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide">Current Week</Label>
              <Input type="number" value={week} onChange={(e) => setWeek(parseInt(e.target.value))} className="bg-background/50 border-border w-1/2" />
              <p className="text-xs text-muted-foreground">Update this when a new week begins.</p>
            </div>
            <Button onClick={handleUpdate} disabled={updatePool.isPending} className="w-full font-bebas text-xl tracking-wider h-12 mt-2">
              {updatePool.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-[linear-gradient(145deg,rgba(220,38,38,0.05)_0%,rgba(10,14,26,1)_100%)] border-destructive/30">
          <CardHeader>
            <CardTitle className="font-bebas text-2xl tracking-wide text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Process Eliminations
            </CardTitle>
            <CardDescription className="text-muted-foreground/80">Grade picks and eliminate players who chose losing teams.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide text-destructive/80">Processing Week</Label>
              <Input type="number" value={processingWeek} onChange={(e) => setProcessingWeek(parseInt(e.target.value))} className="bg-background/50 border-destructive/20 w-1/2" />
            </div>
            <div className="grid gap-2">
              <Label className="font-bebas text-lg tracking-wide text-destructive/80">Losing Team IDs</Label>
              <Input 
                placeholder="e.g. DAL, NYG, PHI" 
                value={losingTeams} 
                onChange={(e) => setLosingTeams(e.target.value)} 
                className="bg-background/50 border-destructive/20 font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Comma-separated abbreviations of teams that lost.</p>
            </div>
            <Button 
              variant="destructive" 
              onClick={handleProcess} 
              disabled={processResults.isPending || !losingTeams.trim()}
              className="w-full font-bebas text-xl tracking-wider h-12 mt-2"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              {processResults.isPending ? "Processing..." : "Process Week Results"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
