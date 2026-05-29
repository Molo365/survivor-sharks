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
import { NavBar } from "@/components/NavBar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(3, "Pool name must be at least 3 characters").max(50),
  sport: z.nativeEnum(PoolInputSport),
  description: z.string().max(500).optional(),
  maxEntries: z.coerce.number().min(1).optional().or(z.literal("").transform(() => undefined)),
  entryFee: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  prizePot: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  season: z.coerce.number().min(2000).max(2100).default(new Date().getFullYear()),
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
      description: "",
      season: new Date().getFullYear(),
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createPool.mutate(
      { data: values as any },
      {
        onSuccess: (pool) => {
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
          toast({
            title: "Pool Created!",
            description: "Your pool is ready. Invite members to join.",
          });
          setLocation(`/pools/${pool.id}`);
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Failed to create pool",
            description: error?.message || "Please try again.",
          });
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Pool Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Shark Week 2024" {...field} data-testid="input-pool-name" className="bg-background/50 border-primary/20" />
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
