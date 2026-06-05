import { z } from "zod";
import { useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { NavBar } from "@/components/NavBar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Trophy, RefreshCw, Target, ShieldCheck, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import wcLogoImg from "@assets/WorldCup2026_1780690496803.png";

// ── Sport cards ────────────────────────────────────────────────────────────────

const SPORTS = [
  {
    id: PoolInputSport.mlb,
    label: "MLB",
    sublabel: "Baseball",
    logoUrl: "https://a.espncdn.com/i/leaguelogos/mlb/500/1.png",
    logoImg: null as string | null,
  },
  {
    id: PoolInputSport.nfl,
    label: "NFL",
    sublabel: "Football",
    logoUrl: "https://a.espncdn.com/i/leaguelogos/nfl/500/1.png",
    logoImg: null as string | null,
  },
  {
    id: PoolInputSport.nba,
    label: "NBA",
    sublabel: "Basketball",
    logoUrl: "https://a.espncdn.com/i/leaguelogos/nba/500/1.png",
    logoImg: null as string | null,
  },
  {
    id: PoolInputSport.nhl,
    label: "NHL",
    sublabel: "Hockey",
    logoUrl: "https://a.espncdn.com/i/leaguelogos/nhl/500/1.png",
    logoImg: null as string | null,
  },
  {
    id: PoolInputSport.worldcup,
    label: "World Cup",
    sublabel: "2026",
    logoUrl: null as string | null,
    logoImg: wcLogoImg,
  },
] as const;

// ── Which pool types are available per sport ───────────────────────────────────

const SPORT_POOL_TYPES: Record<string, Array<"season" | "weekly" | "pickem">> = {
  [PoolInputSport.mlb]:      ["pickem"],
  [PoolInputSport.nfl]:      ["season", "pickem"],
  [PoolInputSport.nba]:      ["season", "weekly", "pickem"],
  [PoolInputSport.nhl]:      ["season", "weekly", "pickem"],
  [PoolInputSport.worldcup]: ["pickem"],
};

// ── Pool type card definitions ─────────────────────────────────────────────────

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
    id: "pickem" as const,
    label: "Pick-Ems",
    icon: Target,
    tagline: "Pick Every Game, Every Day",
    description:
      "Pick the winner of every game. Whoever has the most correct picks wins.",
    badge: "New",
    badgeClass: "bg-green-500/20 text-green-400 border-green-500/30",
    cardClass:
      "border-green-500/30 bg-[linear-gradient(145deg,rgba(34,197,94,0.05)_0%,transparent_100%)]",
  },
] as const;

// ── Form schema ────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(3, "Pool name must be at least 3 characters").max(50),
  sport: z.nativeEnum(PoolInputSport),
  poolType: z.enum(["season", "weekly", "pickem"]).default("season"),
  pickFrequency: z.enum(["weekly", "daily"]).default("weekly"),
  doubleElimination: z.boolean().default(false),
  description: z.string().max(500).optional(),
  maxEntries: z.coerce.number().min(1).optional().or(z.literal("").transform(() => undefined)),
  entryFee: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  prizePot: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  season: z.coerce.number().min(2000).max(2100).default(new Date().getFullYear()),
});

// ── Component ──────────────────────────────────────────────────────────────────

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

  const selectedSport = form.watch("sport");
  const selectedType = form.watch("poolType");

  const availableTypes = SPORT_POOL_TYPES[selectedSport] ?? ["season", "weekly", "pickem"];
  const isPickemOnly = availableTypes.length === 1 && availableTypes[0] === "pickem";
  const showCompStyleSelector =
    selectedType === "pickem" && selectedSport === PoolInputSport.mlb;

  // When sport changes: enforce valid pool type and set sensible defaults
  useEffect(() => {
    const types = SPORT_POOL_TYPES[selectedSport] ?? ["season", "weekly", "pickem"];
    if (!types.includes(selectedType as any)) {
      form.setValue("poolType", types[0], { shouldValidate: true });
    }
    if (selectedSport === PoolInputSport.worldcup) {
      form.setValue("pickFrequency", "daily");
    }
  }, [selectedSport]); // eslint-disable-line react-hooks/exhaustive-deps

  // When pool type switches to pickem, default frequency to daily
  useEffect(() => {
    if (selectedType === "pickem" && selectedSport !== PoolInputSport.worldcup) {
      form.setValue("pickFrequency", "daily");
    }
  }, [selectedType]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageTitle =
    selectedSport === PoolInputSport.worldcup
      ? "WORLD CUP 2026 PICK-EMS"
      : selectedSport === PoolInputSport.mlb
      ? "MLB PICK-EMS"
      : "CREATE A NEW POOL";

  const pageSubtitle =
    selectedType === "pickem"
      ? "Pick every game, every day."
      : "Set the rules. Invite the sharks.";

  function onSubmit(values: z.infer<typeof formSchema>) {
    createPool.mutate(
      { data: values as any },
      {
        onSuccess: (pool) => {
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
          toast({ title: "Pool Created!", description: "Your pool is ready. Invite members to join." });
          setLocation(`/pools/${pool.id}`);
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Failed to create pool",
            description: error?.message || "Please try again.",
          });
        },
      },
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
          <h1 className="font-bebas text-4xl tracking-wide text-primary">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider">{pageSubtitle}</p>
        </div>

        <div className="shark-card rounded-lg p-6 md:p-8 border-border/50">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* ── Step 1: Sport selection ── */}
              <FormField
                control={form.control}
                name="sport"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-xl tracking-wide">Select a Sport</FormLabel>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-2">
                      {SPORTS.map((sport) => {
                        const isSelected = field.value === sport.id;
                        return (
                          <button
                            key={sport.id}
                            type="button"
                            data-testid={`sport-card-${sport.id}`}
                            onClick={() => field.onChange(sport.id)}
                            className={cn(
                              "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              isSelected
                                ? "border-primary/60 bg-primary/8 ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                                : "border-border/40 bg-card/50 hover:border-primary/30 hover:bg-primary/5",
                            )}
                          >
                            <div className="w-12 h-12 flex items-center justify-center">
                              {sport.logoImg ? (
                                <img
                                  src={sport.logoImg}
                                  alt={sport.label}
                                  className="w-12 h-12 object-contain"
                                />
                              ) : (
                                <img
                                  src={sport.logoUrl!}
                                  alt={sport.label}
                                  className="w-10 h-10 object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                            </div>
                            <div className="text-center leading-tight">
                              <div className={cn(
                                "font-bebas text-base tracking-wide leading-none",
                                isSelected ? "text-primary" : "text-foreground",
                              )}>
                                {sport.label}
                              </div>
                              <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sport.sublabel}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Step 2: Pool type (hidden when only pickem is available) ── */}
              {!isPickemOnly && (
                <FormField
                  control={form.control}
                  name="poolType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-xl tracking-wide">Pool Type</FormLabel>
                      <div className="grid grid-cols-1 gap-3 mt-2">
                        {POOL_TYPES.filter((t) => availableTypes.includes(t.id)).map((type) => {
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
                                  : "border-border/40 hover:border-border bg-card/50",
                              )}
                            >
                              <div className="flex items-start gap-4">
                                <div className={cn(
                                  "mt-0.5 p-2 rounded-md",
                                  isSelected ? "bg-primary/10" : "bg-muted/50",
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
                                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30",
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

              {/* ── Competition style: MLB Pick-Ems only ── */}
              {showCompStyleSelector && (
                <FormField
                  control={form.control}
                  name="pickFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-xl tracking-wide">Competition Style</FormLabel>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {([
                          {
                            id: "daily" as const,
                            label: "Daily",
                            icon: Calendar,
                            desc: "Leaderboard shows today's picks only — fresh competition every day.",
                          },
                          {
                            id: "weekly" as const,
                            label: "Weekly",
                            icon: Clock,
                            desc: "Picks accumulate Monday–Sunday. Leaderboard shows the full week with per-day breakdown.",
                            badge: "New",
                          },
                        ] as const).map((opt) => {
                          const Icon = opt.icon;
                          const isSelected = field.value === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => field.onChange(opt.id)}
                              data-testid={`pickem-freq-${opt.id}`}
                              className={cn(
                                "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isSelected
                                  ? "border-primary/60 bg-primary/5 ring-2 ring-offset-1 ring-offset-background"
                                  : "border-border/40 hover:border-border bg-card/50",
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
                                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30",
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

              {/* ── Double Elimination — MLB/NFL survivor only ── */}
              {(selectedSport === PoolInputSport.mlb || selectedSport === PoolInputSport.nfl) &&
                selectedType !== "weekly" && selectedType !== "pickem" && (
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

              {/* ── Pool name ── */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Pool Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Shark Week 2026"
                        {...field}
                        data-testid="input-pool-name"
                        className="bg-background/50 border-primary/20"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Description ── */}
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

              {/* ── Money fields ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/50">
                <FormField
                  control={form.control}
                  name="maxEntries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Max Entries</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Unlimited"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-max-entries"
                          className="bg-background/50 border-primary/20"
                        />
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
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Free"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-entry-fee"
                          className="bg-background/50 border-primary/20"
                        />
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
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-prize-pot"
                          className="bg-background/50 border-primary/20"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">Total winnings (display only)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-6 flex justify-end">
                <Button
                  type="submit"
                  className="font-bebas text-xl tracking-widest px-8 h-12"
                  disabled={createPool.isPending}
                  data-testid="button-submit-create-pool"
                >
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
