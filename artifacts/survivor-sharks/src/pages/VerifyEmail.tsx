import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type VerificationState =
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<VerificationState>({ status: "loading" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState({ status: "error", message: "This verification link is missing its token." });
      return;
    }

    let cancelled = false;
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
        if (!response.ok) throw new Error(body.error ?? "This verification link is invalid or has expired.");
        if (cancelled) return;
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setState({ status: "success", message: body.message ?? "Your email has been verified." });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not verify your email." });
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))]">
      <Card className="w-full max-w-md shark-card border-border/50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            {state.status === "loading" ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : state.status === "success" ? <CheckCircle2 className="h-7 w-7 text-emerald-400" /> : <AlertCircle className="h-7 w-7 text-destructive" />}
          </div>
          <CardTitle className="font-bebas text-4xl tracking-widest text-primary">
            {state.status === "loading" ? "VERIFYING EMAIL" : state.status === "success" ? "EMAIL VERIFIED" : "VERIFICATION FAILED"}
          </CardTitle>
          <CardDescription>
            {state.status === "loading" ? "Checking your verification link…" : state.message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.status === "success" ? (
            <Button type="button" onClick={() => setLocation("/dashboard")}><MailCheck className="mr-2 h-4 w-4" />Go to dashboard</Button>
          ) : state.status === "error" ? (
            <Link href="/dashboard"><Button type="button" variant="outline" className="w-full">Return to dashboard</Button></Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}