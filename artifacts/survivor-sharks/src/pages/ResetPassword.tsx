import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirm: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Extract token from URL query string
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!token) {
      toast({ variant: "destructive", title: "Invalid reset link", description: "No token found in the URL." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Reset failed", description: data.error ?? "Something went wrong." });
        return;
      }
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
      setDone(true);
      setTimeout(() => setLocation("/dashboard"), 2000);
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Could not reach the server." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))]">
        <Card className="w-full max-w-md shark-card border-border/50 text-center p-8">
          <p className="text-destructive font-medium">Invalid or missing reset token.</p>
          <Link href="/login" className="text-primary text-sm mt-4 inline-block hover:underline">Back to login</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))]">
      <Card className="w-full max-w-md shark-card border-border/50">
        <CardHeader className="space-y-1 text-center pb-8">
          <div className="flex justify-center mb-3">
            <img src="/logo.png" alt="Survivor Sharks" className="h-14 w-14 object-contain drop-shadow-[0_0_12px_rgba(30,144,255,0.5)]" />
          </div>
          <CardTitle className="font-bebas text-4xl text-primary tracking-widest">
            {done ? "PASSWORD RESET!" : "NEW PASSWORD"}
          </CardTitle>
          <CardDescription className="text-muted-foreground uppercase tracking-wider font-medium text-xs">
            {done ? "Redirecting to your dashboard…" : "Enter your new password below"}
          </CardDescription>
        </CardHeader>

        {!done && (
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bebas text-lg tracking-wide">Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 font-bebas text-xl tracking-widest" disabled={submitting}>
                  {submitting ? "Resetting…" : "Set New Password"}
                </Button>
              </form>
            </Form>
          </CardContent>
        )}

        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <Link href="/login" className="text-sm text-primary hover:underline">Back to login</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
