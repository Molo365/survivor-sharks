import { z } from "zod";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreatePool, PoolInputSport, getListPoolsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
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
import { Trophy, RefreshCw, Target, ShieldCheck, Calendar, Clock, X, ListOrdered, Dice5, Zap, Repeat, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Sport cards ────────────────────────────────────────────────────────────────

const SPORTS = [
  {
    id: PoolInputSport.mlb,
    label: "MLB",
    sublabel: "Baseball",
    logoImg: '/MLB-Logo.png',
  },
  {
    id: PoolInputSport.nfl,
    label: "NFL",
    sublabel: "Football",
    logoImg: '/NFL-Logo.png',
  },
  {
    id: PoolInputSport.nba,
    label: "NBA",
    sublabel: "Basketball",
    logoImg: '/NBA-Logo.png',
  },
  {
    id: PoolInputSport.nhl,
    label: "NHL",
    sublabel: "Hockey",
    logoImg: '/NHL-Logo.png',
  },
  {
    id: PoolInputSport.worldcup,
    label: "WC",
    sublabel: "World Cup",
    logoImg: '/WorldCup2026.png',
  },
] as const;

const SPORT_POOL_TYPES: Record<string, string[]> = {
  [PoolInputSport.mlb]: ["pickem", "crazy_8s"],
  [PoolInputSport.nfl]: ["season", "nfl_division_predictor", "nfl_confidence", "nfl_confidence_weekly", "pickem_season"],
  [PoolInputSport.nba]: ["season", "weekly"],
  [PoolInputSport.nhl]: ["season", "pickem", "crazy_8s"],
  [PoolInputSport.worldcup]: ["pickem", "group_stage_predictor", "wc_bracket"],
};

const POOL_TYPES = [
  {
    id: "season" as const,
    label: "Survivor Season",
    icon: Trophy,
    tagline: "Last One Standing Wins",
    description:
      "Pick one team per week to win. Pick wrong and you're eliminated. Survive the whole season to claim the prize.",
    badge: "Flagship",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    cardClass: "border-amber-500/60 bg-[linear-gradient(145deg,rgba(245,158,11,0.10)_0%,transparent_100%)]",
  },
  {
    id: "weekly" as const,
    label: "Weekly",
    icon: RefreshCw,
    tagline: "Fresh Start Every Week",
    description:
      "Each week is its own mini-survivor contest. Eliminated players reset and rejoin next week.",
    badge: "Casual",
    badgeClass: "bg-accent/20 text-accent border-accent/30",
    cardClass: "border-accent/60 bg-[linear-gradient(145deg,rgba(0,200,150,0.05)_0%,transparent_100%)]",
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
  {
    id: "group_stage_predictor" as const,
    label: "Group Stage Predictor",
    icon: ListOrdered,
    tagline: "Predict Every Group, Every Position",
    description:
      "Rank all 4 teams in each World Cup group from 1st to 4th. Compete to nail the final group standings.",
    badge: "WC 2026",
    badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    cardClass:
      "border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,transparent_100%)]",
  },
  {
    id: "wc_bracket" as const,
    label: "Round of 32 Bracket",
    icon: Globe,
    tagline: "Pick the Winner of Every R32 Match",
    description:
      "Pick the winner of all 16 Round of 32 matches. Each game locks individually at kickoff — most correct picks wins.",
    badge: "WC 2026",
    badgeClass: "bg-green-500/20 text-green-400 border-green-500/30",
    cardClass:
      "border-green-500/30 bg-[linear-gradient(145deg,rgba(34,197,94,0.06)_0%,transparent_100%)]",
  },
  {
    id: "nfl_division_predictor" as const,
    label: "Division Predictor",
    icon: ListOrdered,
    tagline: "Rank Every Team in Every Division",
    description:
      "Predict the final standings of all 8 NFL divisions. 3 pts for exact position, 1 pt for getting a team's top-2 finish right. Max 96 pts — highest score wins.",
    badge: "NFL",
    badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    cardClass:
      "border-yellow-500/30 bg-[linear-gradient(145deg,rgba(234,179,8,0.06)_0%,transparent_100%)]",
  },
  {
    id: "nfl_confidence" as const,
    label: "Confidence Picks — Season",
    icon: Zap,
    tagline: "18 Weeks. Points Stack. Season Champion.",
    description:
      "Pick every game every week. Assign confidence points 1–N. Points accumulate all 18 weeks. Season champion wins the pot.",
    badge: "NFL",
    badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    cardClass:
      "border-purple-500/60 bg-[linear-gradient(145deg,rgba(168,85,247,0.08)_0%,transparent_100%)]",
  },
  {
    id: "nfl_confidence_weekly" as const,
    label: "Confidence Picks — Weekly",
    icon: Zap,
    tagline: "Pick Every Game. Win The Week.",
    description:
      "Pick every game on the weekly NFL slate. Assign confidence points 1–N. Highest weekly total wins. Fresh start every week.",
    badge: "NFL",
    badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    cardClass:
      "border-purple-500/60 bg-[linear-gradient(145deg,rgba(168,85,247,0.08)_0%,transparent_100%)]",
  },
  {
    id: "pickem_season" as const,
    label: "NFL Pick-Ems Season",
    icon: Target,
    tagline: "Pick Every Game. Win The Season.",
    description:
      "Pick the winner of every NFL game each week. Most correct picks at the end of the season wins. Tiebreaker on Week 18.",
    badge: "NFL",
    badgeClass: "bg-green-500/20 text-green-400 border-green-500/30",
    cardClass:
      "border-green-500/60 bg-[linear-gradient(145deg,rgba(34,197,94,0.08)_0%,transparent_100%)]",
  },
  {
    id: "crazy_8s" as const,
    label: "Crazy 8's",
    icon: Dice5,
    tagline: "8 Games. 8 Confidence Points.",
    description:
      "Pick any 8 games from the slate, choose a winner for each, and assign confidence points 1–8. Highest total wins. NHL version uses the weekend (Sat+Sun) slate.",
    badge: "MLB/NHL",
    badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    cardClass:
      "border-purple-500/60 bg-[linear-gradient(145deg,rgba(168,85,247,0.08)_0%,transparent_100%)]",
  },
] as const;

// ── Prize helpers ──────────────────────────────────────────────────────────────

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

// ── Step header (progressive-unlock wizard) ──────────────────────────────────────

function StepHeader({
  n,
  title,
  complete,
  onEdit,
}: {
  n: number;
  title: string;
  complete?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-bebas text-lg leading-none",
          complete ? "border-primary bg-primary text-primary-foreground" : "border-primary/60 text-primary",
        )}
      >
        {complete ? "✓" : n}
      </div>
      <h2 className="flex-1 font-bebas text-xl tracking-wide text-foreground">{title}</h2>
      {complete && onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-8 text-sm text-primary/70 hover:text-primary"
          data-testid={`button-edit-step-${n}`}
        >
          Edit
        </Button>
      )}
    </div>
  );
}

// ── Form schema ────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(3, "Pool name must be at least 3 characters").max(50),
  sport: z.nativeEnum(PoolInputSport),
  poolType: z.enum(["season", "weekly", "pickem", "group_stage_predictor", "nfl_division_predictor", "dirty_dozen", "crazy_8s", "nfl_confidence", "nfl_confidence_weekly", "pickem_season", "wc_bracket"]).default("season"),
  pickFrequency: z.enum(["weekly", "daily"]).default("weekly"),
  doubleElimination: z.boolean().default(false),
  isRecurring: z.boolean().default(false),
  sandboxMode: z.boolean().default(false),
  description: z.string().max(500).optional(),
  maxEntries: z.coerce.number().min(1).optional().or(z.literal("").transform(() => undefined)),
  entryFee: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  season: z.coerce.number().min(2000).max(2100).default(new Date().getFullYear()),
});

// ── Component ──────────────────────────────────────────────────────────────────

export default function CreatePool() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createPool = useCreatePool();
  const { user, isLoading: authLoading } = useAuth();
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      return res.json() as Promise<{ poolCreationOpen: boolean }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Prize structure managed outside react-hook-form (dynamic list)
  const [prizes, setPrizes] = useState<Array<{ amount: string }>>([{ amount: "100" }]);
  const [commissionerCut, setCommissionerCut] = useState(0);
  const [showCommissionerCut, setShowCommissionerCut] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<"winner" | "top2" | "top3" | "custom">("winner");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sport: undefined,
      poolType: undefined,
      pickFrequency: "weekly",
      description: "",
      season: new Date().getFullYear(),
    },
  });

  const selectedSport = form.watch("sport");
  const selectedType = form.watch("poolType");
  const watchedName = form.watch("name");
  const watchedEntryFee = form.watch("entryFee");
  const watchedMaxEntries = form.watch("maxEntries");
  const watchedFreq = form.watch("pickFrequency");

  const availableTypes = SPORT_POOL_TYPES[selectedSport] ?? ["season", "weekly", "pickem"];

  // ── Progressive-unlock wizard state ──────────────────────────────────────────
  const [step3Confirmed, setStep3Confirmed] = useState(false);
  // When the user clicks "Edit" on a completed step we jump back to it, overriding
  // the naturally-derived active step until they finish editing.
  const [editStep, setEditStep] = useState<number | null>(1);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const step4Ref = useRef<HTMLDivElement>(null);
  const step5Ref = useRef<HTMLDivElement>(null);
  const step6Ref = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const isMounted = useRef(false);

  // When sport changes: enforce valid pool type and set sensible defaults
  useEffect(() => {
    const types = SPORT_POOL_TYPES[selectedSport] ?? ["season", "weekly", "pickem"];
    if (!types.includes(selectedType as any)) {
      form.setValue("poolType", types[0] as "season" | "pickem" | "weekly" | "group_stage_predictor" | "nfl_division_predictor" | "dirty_dozen" | "crazy_8s" | "nfl_confidence" | "nfl_confidence_weekly" | "pickem_season" | "wc_bracket", { shouldValidate: true });
    }
    if (selectedSport === PoolInputSport.worldcup) {
      form.setValue("pickFrequency", "daily");
    }
  }, [selectedSport]); // eslint-disable-line react-hooks/exhaustive-deps

  // When pool type switches to pickem, default frequency: weekly for NHL, daily for everything else
  useEffect(() => {
    if (selectedType === "pickem" && selectedSport !== PoolInputSport.worldcup) {
      form.setValue("pickFrequency", selectedSport === PoolInputSport.nhl ? "weekly" : "daily");
    }
  }, [selectedType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure prize slots match the pool type's fixed structure
  useEffect(() => {
    if (selectedType === "pickem_season") {
      setPrizes(p => [p[0] ?? { amount: "" }]);
    } else {
      setPrizes(p => (p.length === 2 && p[1].amount === "" ? [p[0] ?? { amount: "" }] : p));
    }
  }, [selectedType]);

  // Sync prizes state whenever a non-custom preset or commissionerCut changes
  useEffect(() => {
    const pot = 100 - commissionerCut;
    if (selectedPreset === "winner") {
      setPrizes([{ amount: String(pot) }]);
    } else if (selectedPreset === "top2") {
      setPrizes([
        { amount: String(Math.round(pot * 0.8)) },
        { amount: String(Math.round(pot * 0.2)) },
      ]);
    } else if (selectedPreset === "top3") {
      setPrizes([
        { amount: String(Math.round(pot * 0.7)) },
        { amount: String(Math.round(pot * 0.2)) },
        { amount: String(Math.round(pot * 0.1)) },
      ]);
    }
    // custom: don't auto-update prizes
  }, [commissionerCut, selectedPreset]);

  // Prize structure helpers
  function addPrize() {
    if (prizes.length < 10) setPrizes(p => [...p, { amount: "" }]);
  }
  function removePrize(idx: number) {
    setPrizes(p => p.filter((_, i) => i !== idx));
  }
  function updatePrize(idx: number, amount: string) {
    setPrizes(p => p.map((entry, i) => (i === idx ? { amount } : entry)));
  }

  // ── Step tracking (derived — no useState) ────────────────────────────────────

  // Whether the selected sport/type exposes any Step 3 options (double elim, recurring, sandbox)
  const hasOptions = (
    ((selectedSport === PoolInputSport.mlb || selectedSport === PoolInputSport.nfl) &&
      selectedType !== "weekly" && selectedType !== "pickem") ||
    ((selectedSport === PoolInputSport.mlb && selectedType === "pickem") ||
      selectedType === "nfl_confidence_weekly") ||
    (user?.role === "admin" && (selectedType === "nfl_confidence" ||
      selectedType === "pickem_season" || (selectedSport === PoolInputSport.nhl && selectedType === "season")))
  );

  // Furthest step the user has legitimately progressed to (derived from field values).
  // Entry fee and max entries are optional, so they are NOT gates here — only prizes
  // must total 100% before the pool can be created.
  const currentStep = (() => {
    if (!selectedSport) return 1;
    if (!selectedType || availableTypes.length === 0) return 2;
    if (hasOptions && !step3Confirmed) return 3;
    if (!watchedName || watchedName.trim().length < 3) return 4;
    const prizeTotal = prizes.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + commissionerCut;
    if (Math.abs(prizeTotal - 100) > 0.5) return 5;
    return 6;
  })();

  // The step that is expanded for editing: an explicit "Edit" jump wins, otherwise
  // it's the natural frontier. editStep is clamped so it can never point past progress.
  const activeStep = editStep !== null && editStep <= currentStep ? editStep : currentStep;

  const isStepActive   = (step: number) => step === activeStep;
  const isStepLocked   = (step: number) => step > currentStep;
  const isStepComplete = (step: number) => step <= currentStep && step !== activeStep;

  // Reset Step 3 confirmation and any active edit whenever the sport or pool type changes.
  // Skip the initial mount so the editStep=1 initializer is not immediately overwritten.
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    setStep3Confirmed(false);
    setEditStep(null);
  }, [selectedSport, selectedType]);

  // Auto-scroll to the active step when it changes (skip the initial mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const refs = [null, step1Ref, step2Ref, step3Ref, step4Ref, step5Ref, step6Ref];
    refs[activeStep]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeStep]);

  // ── Derived summaries for completed steps ────────────────────────────────────
  const sportMeta = SPORTS.find((s) => s.id === selectedSport);

  const poolTypeLabel = (() => {
    if (selectedSport === PoolInputSport.mlb && selectedType === "pickem") {
      return watchedFreq === "daily" ? "Daily Pick-Ems" : "Weekly Pick-Ems";
    }
    if (selectedType === "pickem" && selectedSport === PoolInputSport.nhl) return "NHL Pick-Ems";
    if (selectedType === "crazy_8s" && selectedSport === PoolInputSport.nhl) return "Hit the Ice!";
    return POOL_TYPES.find((t) => t.id === selectedType)?.label ?? String(selectedType);
  })();

  const optionsSummary =
    [
      form.getValues("doubleElimination") && "Double Elimination",
      form.getValues("isRecurring") && "Recurring",
      form.getValues("sandboxMode") && "Sandbox Mode",
    ]
      .filter(Boolean)
      .join(" · ") || "No extra options";

  const prizeSummary = (() => {
    const firstPct = parseFloat(prizes[0]?.amount ?? "0") || 0;
    const players = watchedMaxEntries && watchedMaxEntries > 0 ? `${watchedMaxEntries} max players` : "Unlimited players";
    const fee = watchedEntryFee && watchedEntryFee > 0 ? `$${Math.round(watchedEntryFee)} entry` : "Free entry";
    return `${players} · ${fee} · ${firstPct}% to 1st`;
  })();

  const pageTitle =
    selectedSport === PoolInputSport.worldcup
      ? "WORLD CUP 2026 PICK-EMS"
      : selectedSport === PoolInputSport.mlb && selectedType === "dirty_dozen"
      ? "MLB DIRTY DOZEN"
      : selectedSport === PoolInputSport.mlb && selectedType === "crazy_8s"
      ? "MLB CRAZY 8'S"
      : selectedSport === PoolInputSport.nhl && selectedType === "crazy_8s"
      ? "HIT THE ICE!"
      : selectedSport === PoolInputSport.mlb
      ? "MLB PICK-EMS"
      : "CREATE A NEW POOL";

  const pageSubtitle =
    selectedType === "dirty_dozen"
      ? "12 curated games per week. Assign confidence points 1–12."
      : selectedType === "crazy_8s" && selectedSport === PoolInputSport.nhl
      ? "Pick any 8 games from the weekend NHL slate. Assign confidence points 1–8."
      : selectedType === "crazy_8s"
      ? "Pick any 8 games from today's slate. Assign confidence points 1–8."
      : selectedType === "pickem"
      ? "Pick every game, every day."
      : "Set the rules. Invite the sharks.";

  function onSubmit(values: z.infer<typeof formSchema>) {
    const prizeStructure = prizes
      .map((p, i) => ({ place: i + 1, amount: parseFloat(p.amount) || 0 }))
      .filter(p => p.amount > 0);

    // Client-side validation: all prize %s + commissionerCut must sum to 100 ±0.5
    const pctSum = prizeStructure.reduce((sum, p) => sum + p.amount, 0);
    const total = pctSum + commissionerCut;
    if (Math.abs(total - 100) > 0.5) {
      toast({
        variant: "destructive",
        title: "Prize percentages don't add up",
        description: `Prize places + commissioner cut must total 100% (currently ${total.toFixed(1)}%).`,
      });
      return;
    }

    // Round entry fee to nearest whole dollar — prevents spinner float drift
    const cleanEntryFee =
      values.entryFee != null ? Math.round(values.entryFee) : undefined;

    createPool.mutate(
      {
        data: {
          ...values,
          prizeMode: "pct",
          commissionerCut,
          showCommissionerCut,
          ...(cleanEntryFee !== undefined && { entryFee: cleanEntryFee }),
          ...(prizeStructure.length > 0 && { prizeStructure }),
          ...((values.poolType === "nfl_confidence" || values.poolType === "nfl_confidence_weekly" || values.poolType === "pickem_season" ||
            (values.sport === PoolInputSport.nhl && values.poolType === "season")) && { sandboxMode: values.sandboxMode }),
          ...((values.sport === PoolInputSport.mlb && values.poolType === "pickem" || values.poolType === "nfl_confidence_weekly") && { isRecurring: values.isRecurring }),
        } as any,
      },
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

  const isAdmin = user?.role === "admin";
  const poolCreationOpen = config?.poolCreationOpen ?? false;

  if (!isAdmin && (authLoading || configLoading)) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <NavBar />
      </div>
    );
  }

  if (!isAdmin && !poolCreationOpen) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <div
          style={{ backgroundImage: `url('/ocean_shark_bg.jpg')`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}
          className="fixed inset-0 -z-10"
        />
        <div className="fixed inset-0 -z-10 bg-black/65" />
        <NavBar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="text-6xl mb-6">🦈</div>
            <h1 className="font-bebas text-5xl tracking-wide text-foreground">COMING SOON</h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Pool creation is launching soon! Sign up now and we&apos;ll let you know the moment it&apos;s live.
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-4 border-primary/30 hover:bg-primary/10 hover:text-primary">
                Back to Home
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Fixed background: shark image + dark overlay */}
      <div
        style={{
          backgroundImage: `url('/ocean_shark_bg.jpg')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
        className="fixed inset-0 -z-10"
      />
      <div className="fixed inset-0 -z-10 bg-black/65" />
      <NavBar />

      <main className="flex-1 container px-4 py-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="font-bebas text-4xl tracking-wide text-primary">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider">{pageSubtitle}</p>
        </div>

        <div className="shark-card rounded-lg p-6 md:p-8 border-border/50">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* ═══════════ STEP 1 — Choose Your Sport ═══════════ */}
              <section ref={step1Ref} className={cn("space-y-3 scroll-mt-24", isStepComplete(1) && "opacity-50")}>
                <StepHeader
                  n={1}
                  title="Choose Your Sport"
                  complete={isStepComplete(1)}
                  onEdit={() => setEditStep(1)}
                />
                {isStepActive(1) ? (
                  <>
                  <FormField
                    control={form.control}
                    name="sport"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-2">
                          {SPORTS.map((sport) => {
                            const isSelected = field.value === sport.id;
                            return (
                              <button
                                key={sport.id}
                                type="button"
                                data-testid={`sport-card-${sport.id}`}
                                onClick={() => { field.onChange(sport.id); setTimeout(() => setEditStep(2), 50); }}
                                className={cn(
                                  "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  isSelected
                                    ? "border-primary/60 bg-primary/8 ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                                    : "border-border/40 bg-card/50 hover:border-primary/30 hover:bg-primary/5",
                                )}
                              >
                                <div className="w-12 h-12 flex items-center justify-center">
                                  <img
                                    src={sport.logoImg}
                                    alt={sport.label}
                                    className="w-12 h-12 object-contain"
                                    onError={(e) => {
                                      const fallback = (sport as { logoFallback?: string }).logoFallback;
                                      if (fallback && e.currentTarget.src !== fallback) {
                                        e.currentTarget.src = fallback;
                                      }
                                    }}
                                  />
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
                  {editStep === 1 && (
                    <div className="flex justify-end pt-1">
                      <Button type="button" onClick={() => setEditStep(null)} className="font-bebas text-lg tracking-widest px-6" data-testid="button-done-step-1">Done →</Button>
                    </div>
                  )}
                  </>
                ) : (
                  <div className="flex items-center gap-3 pl-11">
                    {sportMeta && <img src={sportMeta.logoImg} alt={sportMeta.label} className="w-8 h-8 object-contain" />}
                    <span className="text-foreground font-semibold">
                      {sportMeta?.label}{sportMeta ? ` — ${sportMeta.sublabel}` : ""}
                    </span>
                  </div>
                )}
              </section>

              {/* ═══════════ STEP 2 — Choose Your Pool Type ═══════════ */}
              {!isStepLocked(2) && (
                <section ref={step2Ref} className={cn("space-y-3 scroll-mt-24", isStepComplete(2) && "opacity-50")}>
                  <StepHeader
                    n={2}
                    title="Choose Your Pool Type"
                    complete={isStepComplete(2)}
                    onEdit={() => setEditStep(2)}
                  />
                  {isStepActive(2) ? (
                    <>
                    {availableTypes.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-border/50 bg-card/40 p-8 text-center">
                        <div className="text-4xl mb-3">🚧</div>
                        <p className="font-bebas text-2xl tracking-wide text-foreground">Coming Soon</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {sportMeta?.label} pools aren&apos;t available yet — check back soon!
                        </p>
                      </div>
                    ) : selectedSport === PoolInputSport.mlb ? (
                      <FormField
                        control={form.control}
                        name="pickFrequency"
                        render={({ field }) => (
                          <FormItem>
                            <div className="grid grid-cols-1 gap-3 mt-2">
                              {/* Daily pick-em */}
                              <button
                                type="button"
                                onClick={() => { form.setValue("poolType", "pickem", { shouldValidate: true }); field.onChange("daily"); setEditStep(3); }}
                                data-testid="pickem-freq-daily"
                                className={cn(
                                  "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selectedType === "pickem" && field.value === "daily"
                                    ? "border-primary/60 bg-primary/5 ring-2 ring-offset-1 ring-offset-background"
                                    : "border-border/40 hover:border-border bg-card/50",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Calendar className={cn("w-5 h-5 mt-0.5 shrink-0", selectedType === "pickem" && field.value === "daily" ? "text-primary" : "text-muted-foreground")} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={cn("font-bebas text-lg tracking-wide", selectedType === "pickem" && field.value === "daily" ? "text-foreground" : "text-muted-foreground")}>Daily Pick-Ems</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-snug">Leaderboard shows today's picks only — fresh competition every day.</p>
                                  </div>
                                  <div className={cn("mt-1 w-4 h-4 rounded-full border-2 shrink-0 transition-all", selectedType === "pickem" && field.value === "daily" ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                                </div>
                              </button>
                              {/* Weekly pick-em */}
                              <button
                                type="button"
                                onClick={() => { form.setValue("poolType", "pickem", { shouldValidate: true }); field.onChange("weekly"); setEditStep(3); }}
                                data-testid="pickem-freq-weekly"
                                className={cn(
                                  "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selectedType === "pickem" && field.value === "weekly"
                                    ? "border-primary/60 bg-primary/5 ring-2 ring-offset-1 ring-offset-background"
                                    : "border-border/40 hover:border-border bg-card/50",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Clock className={cn("w-5 h-5 mt-0.5 shrink-0", selectedType === "pickem" && field.value === "weekly" ? "text-primary" : "text-muted-foreground")} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={cn("font-bebas text-lg tracking-wide", selectedType === "pickem" && field.value === "weekly" ? "text-foreground" : "text-muted-foreground")}>Weekly Pick-Ems</span>
                                      <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 bg-primary/20 text-primary border-primary/30">New</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-snug">Picks accumulate Monday–Sunday. Leaderboard shows the full week with per-day breakdown.</p>
                                  </div>
                                  <div className={cn("mt-1 w-4 h-4 rounded-full border-2 shrink-0 transition-all", selectedType === "pickem" && field.value === "weekly" ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                                </div>
                              </button>
                              {/* Crazy 8's */}
                              <button
                                type="button"
                                onClick={() => { form.setValue("poolType", "crazy_8s", { shouldValidate: true }); setEditStep(3); }}
                                data-testid="pickem-freq-crazy_8s"
                                className={cn(
                                  "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selectedType === "crazy_8s"
                                    ? "border-purple-500/60 bg-purple-500/5 ring-2 ring-offset-1 ring-offset-background"
                                    : "border-border/40 hover:border-border bg-card/50",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <Dice5 className={cn("w-5 h-5 mt-0.5 shrink-0", selectedType === "crazy_8s" ? "text-purple-400" : "text-muted-foreground")} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={cn("font-bebas text-lg tracking-wide", selectedType === "crazy_8s" ? "text-foreground" : "text-muted-foreground")}>
                                        Crazy 8's
                                      </span>
                                      <span className="text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 bg-purple-500/20 text-purple-400 border-purple-500/30">
                                        MLB
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-snug">Pick any 8 games from today's slate. Assign confidence points 1–8. Highest total wins.</p>
                                  </div>
                                  <div className={cn("mt-1 w-4 h-4 rounded-full border-2 shrink-0 transition-all", selectedType === "crazy_8s" ? "border-purple-500 bg-purple-500" : "border-muted-foreground/30")} />
                                </div>
                              </button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="poolType"
                        render={({ field }) => (
                          <FormItem>
                            <div className="grid grid-cols-1 gap-3 mt-2">
                              {POOL_TYPES.filter((t) => availableTypes.includes(t.id)).map((type) => {
                                const Icon = type.icon;
                                const isSelected = field.value === type.id;
                                return (
                                  <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => {
                                      field.onChange(type.id);
                                      // Compute hasOptions against the incoming type.id, not the
                                      // stale selectedType — field.onChange hasn't re-rendered yet.
                                      // selectedSport is narrowed to non-mlb here; drop dead mlb branches.
                                      const nextHasOptions = (
                                        (selectedSport === PoolInputSport.nfl && type.id !== "weekly" && type.id !== "pickem") ||
                                        type.id === "nfl_confidence_weekly" ||
                                        (user?.role === "admin" && (type.id === "nfl_confidence" ||
                                          type.id === "pickem_season" || (selectedSport === PoolInputSport.nhl && type.id === "season")))
                                      );
                                      setEditStep(nextHasOptions ? 3 : 4);
                                    }}
                                    data-testid={`pool-type-${type.id}`}
                                    className={cn(
                                      "relative text-left rounded-lg border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      isSelected
                                        ? `${type.cardClass} ring-2 ring-offset-1 ring-offset-background`
                                        : type.id === "season"
                                          ? "border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.02]"
                                          : "border-border/40 hover:border-border bg-card/50",
                                    )}
                                  >
                                    <div className="flex items-start gap-4">
                                      <div className={cn(
                                        "mt-0.5 p-2 rounded-md",
                                        isSelected
                                          ? type.id === "season" ? "bg-amber-500/10" : "bg-primary/10"
                                          : "bg-muted/50",
                                      )}>
                                        <Icon className={cn(
                                          "w-5 h-5",
                                          isSelected
                                            ? type.id === "season" ? "text-amber-400" : "text-primary"
                                            : type.id === "season" ? "text-amber-500/60" : "text-muted-foreground",
                                        )} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                          <span className={cn("font-bebas text-xl tracking-wide", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                            {type.id === "pickem" && selectedSport === PoolInputSport.nhl ? "NHL Pick-Ems"
                                              : type.id === "crazy_8s" && selectedSport === PoolInputSport.nhl ? "Hit the Ice!"
                                              : type.label}
                                          </span>
                                          <span className={cn("text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5",
                                            type.id === "pickem" && selectedSport === PoolInputSport.nhl ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                              : type.id === "crazy_8s" && selectedSport === PoolInputSport.nhl ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                              : type.badgeClass)}>
                                            {type.id === "pickem" && selectedSport === PoolInputSport.nhl ? "NHL"
                                              : type.id === "crazy_8s" && selectedSport === PoolInputSport.nhl ? "NHL"
                                              : type.badge}
                                          </span>
                                        </div>
                                        <p className={cn(
                                          "text-xs font-semibold uppercase tracking-wider mb-1",
                                          isSelected
                                            ? type.id === "season" ? "text-amber-400/80" : "text-primary/70"
                                            : "text-muted-foreground/50",
                                        )}>{type.id === "pickem" && selectedSport === PoolInputSport.nhl ? "Most Correct Picks Wins the Week"
                                          : type.id === "crazy_8s" && selectedSport === PoolInputSport.nhl ? "8 Games. 8 Confidence Points."
                                          : type.tagline}</p>
                                        <p className="text-sm text-muted-foreground leading-snug">{type.id === "pickem" && selectedSport === PoolInputSport.nhl ? "Pick the winner of every NHL game each day. Picks accumulate all week — most correct by Sunday wins the prize pot. Tiebreaker on the last game of the week."
                                          : type.id === "crazy_8s" && selectedSport === PoolInputSport.nhl ? "Pick any 8 games from the weekend (Sat+Sun) NHL slate. Assign confidence points 1–8. Highest total wins."
                                          : type.description}</p>
                                      </div>
                                      <div className={cn(
                                        "mt-1 w-4 h-4 rounded-full border-2 shrink-0 transition-all",
                                        isSelected
                                          ? type.id === "season" ? "border-amber-400 bg-amber-400" : "border-primary bg-primary"
                                          : "border-muted-foreground/30",
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
                    {editStep === 2 && (
                      <div className="flex justify-end pt-1">
                        <Button type="button" onClick={() => setEditStep(null)} className="font-bebas text-lg tracking-widest px-6" data-testid="button-done-step-2">Done →</Button>
                      </div>
                    )}
                    </>
                  ) : (
                    <div className="pl-11">
                      <span className="text-foreground font-semibold">{poolTypeLabel}</span>
                    </div>
                  )}
                </section>
              )}

              {/* ═══════════ STEP 3 — Pool Options ═══════════ */}
              {hasOptions && !isStepLocked(3) && (
                <section ref={step3Ref} className={cn("space-y-3 scroll-mt-24", isStepComplete(3) && "opacity-50")}>
                  <StepHeader
                    n={3}
                    title="Pool Options"
                    complete={isStepComplete(3)}
                    onEdit={() => setEditStep(3)}
                  />
                  {isStepActive(3) ? (
                    <div className="space-y-4">
                      {/* ── Double Elimination — MLB/NFL survivor only ── */}
                      {/* Note: inside the `hasOptions` block TS narrows out selectedType === "weekly", so that check is omitted here (it can never be weekly at runtime either). */}
                      {(selectedSport === PoolInputSport.mlb || selectedSport === PoolInputSport.nfl) &&
                        selectedType !== "pickem" && (
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

                      {/* ── Recurring — MLB Daily Pick-Ems + NFL Confidence Weekly ── */}
                      {(selectedSport === PoolInputSport.mlb && selectedType === "pickem" || selectedType === "nfl_confidence_weekly") && (
                        <FormField
                          control={form.control}
                          name="isRecurring"
                          render={({ field }) => (
                            <FormItem className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <Repeat className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                                  <div>
                                    <FormLabel className="font-bebas text-lg tracking-wide cursor-pointer">
                                      Recurring Pool
                                    </FormLabel>
                                    <FormDescription className="text-xs mt-0.5">
                                      {selectedType === "nfl_confidence_weekly"
                                        ? "When on, the pool auto-advances every week indefinitely. When off, the pool closes after the current week's results are processed."
                                        : "When on, the pool auto-advances every day indefinitely. When off, the pool runs exactly one day then closes permanently."}
                                    </FormDescription>
                                  </div>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="toggle-recurring"
                                  />
                                </FormControl>
                              </div>
                            </FormItem>
                          )}
                        />
                      )}

                      {/* ── Sandbox Mode — NFL Confidence + Pick-Ems Season + NHL Survivor Season ── */}
                      {isAdmin && ((selectedType === "nfl_confidence" || selectedType === "nfl_confidence_weekly" || selectedType === "pickem_season") ||
                        (selectedSport === PoolInputSport.nhl && selectedType === "season")) && (
                        <FormField
                          control={form.control}
                          name="sandboxMode"
                          render={({ field }) => (
                            <FormItem className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <Zap className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                                  <div>
                                    <FormLabel className="font-bebas text-lg tracking-wide cursor-pointer text-yellow-300">
                                      Sandbox Mode
                                    </FormLabel>
                                    <FormDescription className="text-xs mt-0.5">
                                      {selectedSport === PoolInputSport.nhl
                                        ? "Use the real 2025-26 NHL schedule for testing — weeks load via Live Week, scores simulated."
                                        : "Use the hardcoded 2025 NFL schedule with pre-set scores. Great for testing or running a demo season."}
                                    </FormDescription>
                                  </div>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="toggle-sandbox-mode"
                                  />
                                </FormControl>
                              </div>
                            </FormItem>
                          )}
                        />
                      )}

                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          onClick={() => { setStep3Confirmed(true); setEditStep(null); }}
                          className="font-bebas text-lg tracking-widest px-6"
                          data-testid="button-confirm-options"
                        >
                          Continue →
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-11 text-sm text-muted-foreground">{optionsSummary}</div>
                  )}
                </section>
              )}

              {/* ═══════════ STEP 4 — Name Your Pool ═══════════ */}
              {!isStepLocked(4) && (
                <section ref={step4Ref} className={cn("space-y-3 scroll-mt-24", isStepComplete(4) && "opacity-50")}>
                  <StepHeader
                    n={4}
                    title="Name Your Pool"
                    complete={isStepComplete(4)}
                    onEdit={() => setEditStep(4)}
                  />
                  {isStepActive(4) ? (
                    <div className="space-y-6">
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
                            <FormDescription className="text-muted-foreground/70 text-xs leading-relaxed">
                              Optional message shown to players on your invite page — introduce your pool, share rules, or add any details you want newcomers to see before joining.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      {editStep === 4 && (
                        <div className="flex justify-end pt-1">
                          <Button type="button" onClick={() => setEditStep(null)} className="font-bebas text-lg tracking-widest px-6" data-testid="button-done-step-4">Done →</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pl-11">
                      <span className="text-foreground font-semibold">{watchedName}</span>
                    </div>
                  )}
                </section>
              )}

              {/* ═══════════ STEP 5 — Entry & Prize Setup ═══════════ */}
              {!isStepLocked(5) && (
                <section ref={step5Ref} className={cn("space-y-3 scroll-mt-24", isStepComplete(5) && "opacity-50")}>
                  <StepHeader
                    n={5}
                    title="Entry & Prize Setup"
                    complete={isStepComplete(5)}
                    onEdit={() => setEditStep(5)}
                  />
                  {isStepActive(5) ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                                  step="1"
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
                      </div>

                      {/* ── Prize structure ── */}
                      {(() => {
                        const assignedPct = prizes.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                        const remainingPct = 100 - commissionerCut - assignedPct;
                        const pctExceeds = assignedPct + commissionerCut > 100.5;
                        const exampleCount = watchedMaxEntries && watchedMaxEntries > 0 ? watchedMaxEntries : 10;
                        const pot = 100 - commissionerCut;

                        const PRESETS = [
                          {
                            id: "winner" as const,
                            icon: "🏆",
                            label: "Winner Takes All",
                            preview: `1st: ${pot}%`,
                          },
                          {
                            id: "top2" as const,
                            icon: "🥇🥈",
                            label: "Top 2",
                            preview: `1st: ${Math.round(pot * 0.8)}% · 2nd: ${Math.round(pot * 0.2)}%`,
                          },
                          {
                            id: "top3" as const,
                            icon: "🥇🥈🥉",
                            label: "Top 3",
                            preview: `1st: ${Math.round(pot * 0.7)}% · 2nd: ${Math.round(pot * 0.2)}% · 3rd: ${Math.round(pot * 0.1)}%`,
                          },
                          {
                            id: "custom" as const,
                            icon: "✏️",
                            label: "Custom",
                            preview: "Set your own splits",
                          },
                        ];

                        return (
                          <div className="space-y-5">

                            {/* A) Commissioner cut stepper */}
                            <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-3">
                              <div>
                                <p className="font-bebas text-lg tracking-wide text-foreground">Your Commissioner Cut</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  This is your share for organizing the pool. 0% is the default — your players will appreciate it.
                                </p>
                              </div>
                              <div className="flex items-center gap-4">
                                <button
                                  type="button"
                                  onClick={() => setCommissionerCut(c => Math.max(0, c - 1))}
                                  disabled={commissionerCut <= 0}
                                  className="w-9 h-9 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                  aria-label="Decrease commissioner cut"
                                >
                                  −
                                </button>
                                <span className="font-bebas text-3xl tracking-wide text-foreground w-16 text-center tabular-nums">
                                  {commissionerCut}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setCommissionerCut(c => Math.min(15, c + 1))}
                                  disabled={commissionerCut >= 15}
                                  className="w-9 h-9 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center text-lg font-bold text-muted-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                  aria-label="Increase commissioner cut"
                                >
                                  +
                                </button>
                                {commissionerCut > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {100 - commissionerCut}% goes to players
                                  </span>
                                )}
                              </div>
                            </div>

                            {commissionerCut > 0 && (
                              <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/60 px-5 py-4">
                                <div>
                                  <p className="font-bebas text-lg tracking-wide">Show your cut to players?</p>
                                  <p className="text-xs text-muted-foreground">If off, players only see the prize breakdown — not your share.</p>
                                </div>
                                <Switch
                                  checked={showCommissionerCut}
                                  onCheckedChange={setShowCommissionerCut}
                                />
                              </div>
                            )}

                            {/* B) Prize split presets */}
                            <div className="space-y-2">
                              <p className="font-bebas text-lg tracking-wide text-foreground">How do you want to split the pot?</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {PRESETS.map((preset) => {
                                  const isSelected = selectedPreset === preset.id;
                                  return (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      onClick={() => setSelectedPreset(preset.id)}
                                      className={cn(
                                        "text-left rounded-xl border-2 p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isSelected
                                          ? "border-primary bg-primary/10 ring-2 ring-primary/20 ring-offset-1 ring-offset-background"
                                          : "border-border/40 bg-card/50 hover:border-primary/30 hover:bg-primary/5",
                                      )}
                                    >
                                      <div className="text-xl mb-1">{preset.icon}</div>
                                      <div className={cn("font-bebas text-sm tracking-wide leading-tight", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                        {preset.label}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground/70 mt-1 leading-snug">
                                        {preset.preview}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* C) Manual prize inputs — only when custom */}
                            {selectedPreset === "custom" && (
                              <div className="space-y-2">
                                {prizes.map((prize, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="font-bebas text-sm text-muted-foreground w-10 shrink-0 text-right">
                                      {ORDINALS[i]}
                                    </span>
                                    <div className="relative flex-1">
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="1"
                                        placeholder={i === 0 ? "e.g. 80" : "0"}
                                        value={prize.amount}
                                        onChange={(e) => updatePrize(i, e.target.value)}
                                        data-testid={`input-prize-place-${i + 1}`}
                                        className={cn("pr-8 bg-background/50 border-primary/20", pctExceeds && "border-destructive/60 focus-visible:ring-destructive/40")}
                                      />
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm pointer-events-none">%</span>
                                    </div>
                                    {i > 0 ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removePrize(i)}
                                        className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    ) : (
                                      <div className="w-9 shrink-0" />
                                    )}
                                  </div>
                                ))}

                                {prizes.length < 10 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={addPrize}
                                    className="text-primary/70 hover:text-primary pl-0 h-8 text-sm"
                                    data-testid="button-add-prize-place"
                                  >
                                    + Add {ORDINALS[prizes.length]} Place Prize
                                  </Button>
                                )}

                                <p className={cn("text-xs", pctExceeds ? "text-destructive" : "text-muted-foreground")}>
                                  {pctExceeds
                                    ? `Total cannot exceed ${100 - commissionerCut}% — currently ${assignedPct.toFixed(1)}%`
                                    : <>
                                        <span className="text-foreground font-semibold">{assignedPct.toFixed(1)}%</span> assigned
                                        {" · "}
                                        <span className={cn("font-semibold", remainingPct < 0 ? "text-destructive" : "text-foreground")}>
                                          {remainingPct.toFixed(1)}%
                                        </span> remaining
                                      </>
                                  }
                                </p>
                              </div>
                            )}

                            {/* D) Live example payout summary */}
                            {watchedEntryFee != null && watchedEntryFee > 0 && (
                              <div className="rounded-lg bg-muted/20 border border-border/30 p-4 space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  Example with {exampleCount} players at ${Math.round(watchedEntryFee)} entry
                                  {" · "}
                                  Pot = <span className="text-foreground">${Math.round(watchedEntryFee) * exampleCount}</span>
                                </p>
                                <div className="space-y-1">
                                  {prizes.filter(p => parseFloat(p.amount) > 0).map((prize, i) => {
                                    const pct = parseFloat(prize.amount) || 0;
                                    const dollars = (pct / 100) * Math.round(watchedEntryFee) * exampleCount;
                                    return (
                                      <div key={i} className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground font-bebas tracking-wide">{ORDINALS[i]} place</span>
                                        <span className="text-foreground font-semibold">{pct}% → <span className="text-primary">${dollars.toFixed(0)}</span></span>
                                      </div>
                                    );
                                  })}
                                  {commissionerCut > 0 && (
                                    <div className="flex items-center justify-between text-xs border-t border-border/30 pt-1 mt-1">
                                      <span className="text-muted-foreground font-bebas tracking-wide">Commissioner</span>
                                      <span className="text-foreground font-semibold">{commissionerCut}% → <span className="text-amber-400">${((commissionerCut / 100) * Math.round(watchedEntryFee) * exampleCount).toFixed(0)}</span></span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {editStep === 5 && (
                        <div className="flex justify-end pt-1">
                          <Button type="button" onClick={() => setEditStep(null)} className="font-bebas text-lg tracking-widest px-6" data-testid="button-done-step-5">Done →</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pl-11 text-sm text-muted-foreground">{prizeSummary}</div>
                  )}
                </section>
              )}

              {/* ═══════════ STEP 6 — Review & Create ═══════════ */}
              {!isStepLocked(6) && (
                <section ref={step6Ref} className="space-y-3 scroll-mt-24">
                  <StepHeader n={6} title="Review & Create" />
                  <div className="rounded-xl border border-primary/30 bg-card/60 p-5 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground uppercase tracking-wider text-xs">Sport</span>
                      <span className="text-foreground font-semibold">{sportMeta?.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground uppercase tracking-wider text-xs">Pool Type</span>
                      <span className="text-foreground font-semibold">{poolTypeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground uppercase tracking-wider text-xs">Name</span>
                      <span className="text-foreground font-semibold">{watchedName}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground uppercase tracking-wider text-xs">Entry Fee</span>
                      <span className="text-foreground font-semibold">{watchedEntryFee && watchedEntryFee > 0 ? `$${Math.round(watchedEntryFee)}` : "Free"}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground uppercase tracking-wider text-xs">Max Entries</span>
                      <span className="text-foreground font-semibold">{watchedMaxEntries && watchedMaxEntries > 0 ? String(watchedMaxEntries) : "Unlimited"}</span>
                    </div>
                    <div className="border-t border-border/30 pt-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Prize Breakdown</p>
                      <div className="space-y-1">
                        {prizes.filter(p => parseFloat(p.amount) > 0).map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground font-bebas tracking-wide">{ORDINALS[i]} place</span>
                            <span className="text-foreground font-semibold">{parseFloat(p.amount)}%</span>
                          </div>
                        ))}
                        {commissionerCut > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground font-bebas tracking-wide">Commissioner</span>
                            <span className="text-amber-400 font-semibold">{commissionerCut}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full font-bebas text-xl tracking-widest h-14"
                    disabled={createPool.isPending}
                    data-testid="button-submit-create-pool"
                  >
                    {createPool.isPending ? "Creating..." : "Create Pool"}
                  </Button>
                </section>
              )}

            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}
