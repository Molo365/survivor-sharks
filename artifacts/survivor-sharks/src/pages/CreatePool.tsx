import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreatePool, PoolInputSport, getListPoolsQueryKey } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { NavBar } from "@/components/NavBar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Trophy, RefreshCw, Zap, ShieldCheck, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const POOL_TYPES = [
  {
    id: "season" as const,
    label: "Season Pool",
    icon: Trophy,
    tagline: "Classic Survivor",
    description:
      "The full season format. One pick per week, no repeats. Get it wrong and you're out. Last shark standing wins.",
    badge: "Most Popular",
    badgeClass: "bg-primary/20 text-primary border-primary/30",
    cardClass: "border-primary/40 bg-[linear-gradient(145deg,rgba(30,144,255,0.05)_0%,transparent_100%)]",
  },
  {
    id: "weekly" as const,
    label: "Weekly Pool",
    icon: RefreshCw,
    tagline: "Fresh Start Every Week",
    description:
      "No carry-over. Everyone resets to alive each week. Pick the winner, collect the glory — no long-term commitment needed.",
    badge: "Casual",
    badgeClass: "bg-accent/20 text-accent border-accent/30",
    cardClass: "border-accent/30",
  },
  {
    id: "mid_season" as const,
    label: "Mid Season Bum Luck",
    icon: Zap,
    tagline: "Second Chance",
    description:
      "For players knocked out of the Season Pool. Define a start week and they're back in. Same rules, fresh run from that point.",
    badge: "Redemption Arc",
    badgeClass: "bg-destructive/20 text-destructive border-destructive/30",
    cardClass: "border-destructive/20",
  },
] as const;

const formSchema = z.object({
  name: z.string().min(3, "Pool name must be at least 3 characters").max(50),
  sport: z.nativeEnum(PoolInputSport),
  poolType: z.enum(["season", "weekly", "mid_season"]).default("season"),
  pickFrequency: z.enum(["weekly", "daily"]).default("weekly"),
  doubleElimination: z.boolean().default(false),
  startWeek: z.coerce.number().min(1).max(30).optional().or(z.literal("").transform(() => undefined)),
  description: z.string().max(500).optional(),
  maxEntries: z.coerce.number().min(1).optional().or(z.literal("").transform(() => undefined)),
  entryFee: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  prizePot: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  season: z.coerce.number().min(2000).max(2100).default(new Date().getFullYear()),
}).superRefine((data, ctx) => {
  if (data.poolType === "mid_season" && !data.startWeek) {
    ctx.addIssue({ code: "custom", path: ["startWeek"], message: "Start week is required for Mid Season pools" });
  }
});

export default function CreatePool() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createPool = useCreatePool();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sport: PoolInputSport.nfl,
      poolType: "season",
      pickFrequency: "weekly",
      description: "",
      season: new Date().getFullYear(),
    },
  });

  const selectedType = form.watch("poolType");
  const selectedSport = form.watch("sport");

  function onSubmit(values: z.infer<typeof formSchema>) {
    const payload: Record<string, unknown> = { ...values };
    if (values.poolType === "mid_season" && values.startWeek) {
      payload.currentWeek = values.startWeek;
    }
    createPool.mutate(
      { data: payload as any },
      {
        onSuccess: (pool) => {
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
          toast({ title: "Pool Created!", description: "Your pool is ready. Invite members to join." });
          setLocation(`/pools/${pool.id}`);
        },
        onError: (error: any) => {
          toast({ variant: "destructive", title: "Failed to create pool", description: error?.message || "Please try again." });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <NavBar />

      <main className="flex-1 container px-4 py-8 max-w-3xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="font-bebas text-4xl tracking-wide text-primary">CREATE A NEW POOL</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider">Set the rules. Invite the sharks.</p>
        </div>

        <div className="shark-card rounded-lg p-6 md:p-8 border-border/50">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* Pool Type Selector */}
              <FormField
                control={form.control}
                name="poolType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-xl tracking-wide">Pool Type</FormLabel>
                    <div className="grid grid-cols-1 gap-3 mt-2">
                      {POOL_TYPES.map((type) => {
                        const Icon = type.icon;
                        const isSelected = field.value === type.id;
                        return (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => field.onChange(type.id)}
                            data-testid={`pool-type-${type.id}`}
                            className={cn(
                              "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              isSelected
                                ? `${type.cardClass} ring-2 ring-offset-1 ring-offset-background`
                                : "border-border/40 hover:border-border bg-card/50"
                            )}
                          >
                            <div className="flex items-start gap-4">
                              <div className={cn(
                                "mt-0.5 p-2 rounded-md",
                                isSelected ? "bg-primary/10" : "bg-muted/50"
                              )}>
                                <Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <span className={cn("font-bebas text-xl tracking-wide", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                    {type.label}
                                  </span>
                                  <span className={cn("text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5", type.badgeClass)}>
                                    {type.badge}
                                  </span>
                                </div>
                                <p className="text-xs text-primary/70 font-semibold uppercase tracking-wider mb-1">{type.tagline}</p>
                                <p className="text-sm text-muted-foreground leading-snug">{type.description}</p>
                              </div>
                              <div className={cn(
                                "mt-1 w-4 h-4 rounded-full border-2 shrink-0 transition-all",
                                isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                              )} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Start Week — only for mid_season */}
              {selectedType === "mid_season" && (
                <FormField
                  control={form.control}
                  name="startWeek"
                  render={({ field }) => (
                    <FormItem className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                      <FormLabel className="font-bebas text-lg tracking-wide text-destructive/80">Start Week</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="30"
                          placeholder="e.g. 9"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-start-week"
                          className="bg-background/50 border-destructive/20 w-1/3"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Week this pool begins. Players who join can use any team not already used from this week forward.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Pick Format — MLB only */}
              {selectedSport === PoolInputSport.mlb && (
                <FormField
                  control={form.control}
                  name="pickFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-xl tracking-wide">Pick Format</FormLabel>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {([
                          {
                            id: "weekly" as const,
                            label: "Weekly",
                            icon: Clock,
                            desc: "One pick per week — locked on Monday 10 PM ET. Classic survivor format.",
                          },
                          {
                            id: "daily" as const,
                            label: "Daily",
                            icon: Calendar,
                            desc: "One pick per day from that day's slate — locks 5 minutes before first pitch.",
                            badge: "New",
                          },
                        ] as const).map(opt => {
                          const Icon = opt.icon;
                          const isSelected = field.value === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => field.onChange(opt.id)}
                              data-testid={`pick-freq-${opt.id}`}
                              className={cn(
                                "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isSelected
                                  ? "border-primary/60 bg-primary/5 ring-2 ring-offset-1 ring-offset-background"
                                  : "border-border/40 hover:border-border bg-card/50"
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("font-bebas text-lg tracking-wide", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                      {opt.label}
                                    </span>
                                    {"badge" in opt && (
                                      <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 bg-primary/20 text-primary border-primary/30">
                                        {opt.badge}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-snug">{opt.desc}</p>
                                </div>
                                <div className={cn(
                                  "mt-1 w-4 h-4 rounded-full border-2 shrink-0 transition-all",
                                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                )} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Double Elimination toggle — MLB only, not for weekly */}
              {selectedSport === PoolInputSport.mlb && selectedType !== "weekly" && (
                <FormField
                  control={form.control}
                  name="doubleElimination"
                  render={({ field }) => (
                    <FormItem className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <FormLabel className="font-bebas text-lg tracking-wide cursor-pointer">
                              Double Elimination
                            </FormLabel>
                            <FormDescription className="text-xs mt-0.5">
                              Players get one warning strike on their first loss. The second loss eliminates them permanently.
                            </FormDescription>
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="toggle-double-elimination"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              )}

              {/* Name + Sport */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Pool Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Shark Week 2025" {...field} data-testid="input-pool-name" className="bg-background/50 border-primary/20" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sport"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Sport</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-sport" className="bg-background/50 border-primary/20">
                            <SelectValue placeholder="Select sport" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={PoolInputSport.nfl}>NFL Football</SelectItem>
                          <SelectItem value={PoolInputSport.mlb}>MLB Baseball</SelectItem>
                          <SelectItem value={PoolInputSport.nba}>NBA Basketball</SelectItem>
                          <SelectItem value={PoolInputSport.nhl}>NHL Hockey</SelectItem>
                          <SelectItem value={PoolInputSport.fifa}>Soccer (FIFA)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Rules, trash talk, or context for the pool..."
                        {...field}
                        data-testid="input-pool-desc"
                        className="resize-none bg-background/50 border-primary/20 min-h-[100px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/50">
                <FormField
                  control={form.control}
                  name="maxEntries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Max Entries</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" placeholder="Unlimited" {...field} value={field.value ?? ""} data-testid="input-max-entries" className="bg-background/50 border-primary/20" />
                      </FormControl>
                      <FormDescription className="text-xs">Limit total members</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="entryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Entry Fee ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" placeholder="Free" {...field} value={field.value ?? ""} data-testid="input-entry-fee" className="bg-background/50 border-primary/20" />
                      </FormControl>
                      <FormDescription className="text-xs">Cost to join (display only)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="prizePot"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Prize Pot ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} value={field.value ?? ""} data-testid="input-prize-pot" className="bg-background/50 border-primary/20" />
                      </FormControl>
                      <FormDescription className="text-xs">Total winnings (display only)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-6 flex justify-end">
                <Button type="submit" className="font-bebas text-xl tracking-widest px-8 h-12" disabled={createPool.isPending} data-testid="button-submit-create-pool">
                  {createPool.isPending ? "Creating..." : "Create Pool"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}
