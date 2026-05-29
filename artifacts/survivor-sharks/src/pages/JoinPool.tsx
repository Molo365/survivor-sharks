import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useJoinPool, getListPoolsQueryKey } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NavBar } from "@/components/NavBar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";

const formSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export default function JoinPool() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const joinPool = useJoinPool();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      inviteCode: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    joinPool.mutate(
      { data: values },
      {
        onSuccess: (pool) => {
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
          toast({
            title: "Joined Successfully!",
            description: `You are now in ${pool.name}.`,
          });
          setLocation(`/pools/${pool.id}`);
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Failed to join pool",
            description: error?.message || "Invalid invite code or pool is closed.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <NavBar />
      
      <main className="flex-1 container px-4 py-12 max-w-2xl mx-auto flex flex-col justify-center">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors self-start">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
        
        <div className="shark-card rounded-lg p-8 md:p-12 border-border/50 text-center">
          <h1 className="font-bebas text-5xl tracking-widest text-primary mb-2">JOIN A POOL</h1>
          <p className="text-muted-foreground mb-8">Enter the invite code from your commissioner to join the action.</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md mx-auto">
              <FormField
                control={form.control}
                name="inviteCode"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input 
                        placeholder="ENTER CODE" 
                        {...field} 
                        data-testid="input-invite-code" 
                        className="bg-background/50 border-primary/30 h-16 text-center text-2xl font-mono tracking-widest uppercase focus-visible:ring-primary" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full font-bebas text-xl tracking-widest h-14" disabled={joinPool.isPending} data-testid="button-submit-join">
                {joinPool.isPending ? "JOINING..." : "ENTER THE WATERS"}
              </Button>
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}
