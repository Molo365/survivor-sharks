import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLoginUser, useJoinPool, getGetMeQueryKey } from "@workspace/api-client-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const formSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
});

export default function Login() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const loginUser = useLoginUser();
  const joinPool = useJoinPool();
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const forgotForm = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const pendingCode = localStorage.getItem("pending_invite_code");

  if (!isLoading && user && !pendingCode) {
    return <Redirect to="/dashboard" />;
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    loginUser.mutate(
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
                  toast({ title: "You're in! 🎉", description: "Successfully joined the pool." });
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
            title: "Login Failed",
            description: error?.data?.error || error?.message || "Invalid credentials. Please try again.",
          });
        },
      }
    );
  }

  async function onForgotSubmit(values: z.infer<typeof forgotSchema>) {
    setForgotLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      setForgotSent(true);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not send reset email. Try again." });
    } finally {
      setForgotLoading(false);
    }
  }

  function openForgot() {
    setForgotSent(false);
    forgotForm.reset({ email: form.getValues("email") });
    setForgotOpen(true);
  }

  return (
    <>
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))]">
        <Card className="w-full max-w-md shark-card border-border/50">
          <CardHeader className="space-y-1 text-center pb-8">
            <div className="flex justify-center mb-3">
              <img src="/logo.png" alt="Survivor Sharks" className="h-14 w-14 object-contain drop-shadow-[0_0_12px_rgba(30,144,255,0.5)]" />
            </div>
            <CardTitle className="font-bebas text-4xl text-primary tracking-widest">SURVIVOR SHARKS</CardTitle>
            <CardDescription className="text-muted-foreground uppercase tracking-wider font-medium text-xs">
              Enter the waters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Email</FormLabel>
                      <FormControl>
                        <Input placeholder="shark@example.com" {...field} data-testid="input-email" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
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
                      <div className="flex items-center justify-between">
                        <FormLabel className="font-bebas text-lg tracking-wide">Password</FormLabel>
                        <button
                          type="button"
                          onClick={openForgot}
                          className="text-xs text-primary/70 hover:text-primary transition-colors underline-offset-2 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 font-bebas text-xl tracking-widest" disabled={loginUser.isPending} data-testid="button-submit-login">
                  {loginUser.isPending ? "Authenticating..." : "Sign In"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border/50 pt-6">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:underline hover:text-primary/80 font-medium" data-testid="link-to-register">
                Join the frenzy
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={(open) => { setForgotOpen(open); if (!open) setForgotSent(false); }}>
        <DialogContent className="shark-card border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl text-primary tracking-widest">
              {forgotSent ? "CHECK YOUR EMAIL" : "RESET PASSWORD"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {forgotSent
                ? "If that address is registered, you'll receive a reset link shortly. Check your spam folder too."
                : "Enter your email address and we'll send you a reset link."}
            </DialogDescription>
          </DialogHeader>

          {!forgotSent ? (
            <Form {...forgotForm}>
              <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4 pt-2">
                <FormField
                  control={forgotForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-base tracking-wide">Email</FormLabel>
                      <FormControl>
                        <Input placeholder="shark@example.com" {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full font-bebas tracking-widest" disabled={forgotLoading}>
                  {forgotLoading ? "Sending…" : "Send Reset Link"}
                </Button>
              </form>
            </Form>
          ) : (
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-center py-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-2xl">
                  📧
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full border-primary/20 hover:bg-primary/10"
                onClick={() => setForgotOpen(false)}
              >
                Back to Login
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
