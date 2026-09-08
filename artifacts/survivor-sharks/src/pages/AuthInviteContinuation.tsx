import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { getPoolInvitePreview, joinPool } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  authPath,
  clearPendingInvite,
  getPendingInviteCode,
  rememberPendingInvite,
} from "@/lib/pending-invite";

const ALREADY_MEMBER = "already a member";
const POOL_FULL = "pool is full";
const JOIN_BLOCKED = "cannot accept new members";

type JoinState =
  | { status: "joining" }
  | { status: "transient-error"; message: string }
  | { status: "terminal-error"; message: string };

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "We couldn't complete joining the pool.";
  const value = error as { data?: { error?: string }; message?: string };
  return value.data?.error ?? value.message ?? "We couldn't complete joining the pool.";
}

export default function AuthInviteContinuation() {
  const { user, isLoading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [inviteCode] = useState(() => getPendingInviteCode(location));
  const [state, setState] = useState<JoinState>({ status: "joining" });
  const attemptRef = useRef(0);

  async function completeJoin() {
    if (!inviteCode || !user) return;

    const attempt = ++attemptRef.current;
    rememberPendingInvite(inviteCode);
    setState({ status: "joining" });
    const minimumJoiningDisplay = new Promise((resolve) => window.setTimeout(resolve, 500));

    try {
      const pool = await joinPool({ inviteCode });
      await minimumJoiningDisplay;
      if (attempt !== attemptRef.current) return;
      clearPendingInvite();
      setLocation(`/pools/${pool.id}`);
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      const message = errorMessage(error);
      const normalized = message.toLowerCase();

      if (normalized.includes(ALREADY_MEMBER)) {
        try {
          const pool = await getPoolInvitePreview(inviteCode);
          if (attempt !== attemptRef.current) return;
          clearPendingInvite();
          setLocation(`/pools/${pool.id}`);
          return;
        } catch {
          setState({
            status: "transient-error",
            message: "You're already in this pool, but we couldn't open it. Tap below to try again.",
          });
          return;
        }
      }

      if (normalized.includes(POOL_FULL) || normalized.includes(JOIN_BLOCKED)) {
        clearPendingInvite();
        setState({ status: "terminal-error", message });
        return;
      }

      setState({
        status: "transient-error",
        message: "We couldn't complete joining the pool. Your invite is saved—tap below to try again.",
      });
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!inviteCode) {
      setLocation("/dashboard");
      return;
    }
    if (!user) {
      setLocation(authPath("/login", inviteCode));
      return;
    }
    void completeJoin();
    // Run once after auth and invite state are ready; retries are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, inviteCode]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))]">
      <Card className="w-full max-w-md shark-card border-border/50 text-center" data-testid={`invite-continuation-${state.status}`}>
        <CardHeader>
          <div className="flex justify-center mb-3">
            {state.status === "joining" ? (
              <LoaderCircle className="h-12 w-12 animate-spin text-primary" />
            ) : (
              <AlertCircle className="h-12 w-12 text-amber-400" />
            )}
          </div>
          <CardTitle className="font-bebas text-4xl text-primary tracking-widest">
            {state.status === "joining" ? "JOINING THE POOL" : "COULDN'T JOIN THE POOL"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {state.status === "joining"
              ? "Your account is ready. We're completing your pool membership now."
              : state.message}
          </CardDescription>
        </CardHeader>
        {state.status !== "joining" && (
          <CardContent className="space-y-3">
            {state.status === "transient-error" && (
              <Button className="w-full h-12 font-bebas text-xl tracking-widest" onClick={() => void completeJoin()} data-testid="button-retry-invite-join">
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation(state.status === "transient-error" && inviteCode ? `/join/${inviteCode}` : "/dashboard")}
            >
              {state.status === "transient-error" ? "Return to Invite" : "Go to Dashboard"}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}