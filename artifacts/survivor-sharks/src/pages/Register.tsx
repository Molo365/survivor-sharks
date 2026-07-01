import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegisterUser, useJoinPool, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation, Link, Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(20),
  displayName: z.string().optional(),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Register() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const registerUser = useRegisterUser();
  const joinPool = useJoinPool();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", displayName: "", email: "", password: "" },
  });

  const pendingCode = localStorage.getItem("pending_invite_code");

  if (!isLoading && user && !pendingCode) {
    return <Redirect to="/dashboard" />;
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    registerUser.mutate(
      { data: values },
      {
        onSuccess: (data: any) => {
          if (data?.token) {
            localStorage.setItem("auth_token", data.token);
          }
          if (data?.user) {
            queryClient.setQueryData(getGetMeQueryKey(), data.user);
          }

          const pendingCode = localStorage.getItem("pending_invite_code");
          if (pendingCode) {
            localStorage.removeItem("pending_invite_code");
            joinPool.mutate(
              { data: { inviteCode: pendingCode } },
              {
                onSuccess: (pool: any) => {
                  toast({ title: "You're in! 🎉", description: `Successfully joined the pool.` });
                  setLocation(`/pools/${pool.id}`);
                },
                onError: (err: any) => {
                  const msg: string = err?.data?.error ?? err?.message ?? "";
                  if (msg.toLowerCase().includes("already a member")) {
                    fetch(`/api/pools/invite/${pendingCode}/preview`)
                      .then(r => r.json())
                      .then((data: any) => { setLocation(`/pools/${data.id}`); })
                      .catch(() => { setLocation("/dashboard"); });
                  } else if (msg.toLowerCase().includes("pool is full")) {
                    toast({ variant: "destructive", title: "Pool is full", description: "That pool is now full — you weren't able to join." });
                    setLocation("/dashboard");
                  } else {
                    setLocation("/dashboard");
                  }
                },
              },
            );
          } else {
            setLocation("/dashboard");
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Registration Failed",
            description: error?.data?.error || error?.message || "Failed to create account. Username or email might be taken.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))] py-12">
      <Card className="w-full max-w-md shark-card border-border/50">
        <CardHeader className="space-y-1 text-center pb-6">
          <div className="flex justify-center mb-3">
            <img src="/logo.png" alt="Survivor Sharks" className="h-14 w-14 object-contain drop-shadow-[0_0_12px_rgba(30,144,255,0.5)]" />
          </div>
          <CardTitle className="font-bebas text-4xl text-primary tracking-widest">JOIN THE SHARKS</CardTitle>
          <CardDescription className="text-muted-foreground uppercase tracking-wider font-medium text-xs">
            Create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Username</FormLabel>
                    <FormControl>
                      <Input placeholder="shark_slayer" {...field} data-testid="input-username" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Display Name <span className="text-muted-foreground text-sm font-normal">(Optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="The Megalodon" {...field} data-testid="input-display-name" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="shark@example.com" {...field} data-testid="input-email" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-12 font-bebas text-xl tracking-widest mt-6" disabled={registerUser.isPending} data-testid="button-submit-register">
                {registerUser.isPending ? "Creating Account..." : "Register"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline hover:text-primary/80 font-medium" data-testid="link-to-login">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
