import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
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

const formSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export default function JoinPool() {
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      inviteCode: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setLocation(`/join/${values.inviteCode.toUpperCase()}`);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <NavBar />
      
      <main className="flex-1 container px-4 py-12 max-w-2xl mx-auto flex flex-col justify-center">
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

              <Button type="submit" className="w-full font-bebas text-xl tracking-widest h-14" data-testid="button-submit-join">
                ENTER THE WATERS
              </Button>
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}
