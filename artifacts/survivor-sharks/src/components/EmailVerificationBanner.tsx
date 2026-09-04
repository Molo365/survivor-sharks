import { useEffect, useState } from "react";
import { CheckCircle2, MailCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const DISMISSED_PREFIX = "email-verification-banner-dismissed:";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    setDismissed(localStorage.getItem(`${DISMISSED_PREFIX}${user.id}`) === "1");
  }, [user]);

  if (!user || user.emailVerifiedAt !== null || dismissed) return null;
  const currentUser = user;

  async function resendVerificationEmail() {
    setIsSending(true);
    setFeedback(null);
    try {
      const authToken = localStorage.getItem("auth_token");
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not send a verification email.");
      setFeedback({ kind: "success", message: body.message ?? "A fresh verification email has been sent." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not send a verification email." });
    } finally {
      setIsSending(false);
    }
  }

  function dismiss() {
    localStorage.setItem(`${DISMISSED_PREFIX}${currentUser.id}`, "1");
    setDismissed(true);
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">Verify your email to receive pick reminders</p>
        {feedback ? (
          <p className={`mt-1 flex items-center gap-1.5 text-sm ${feedback.kind === "success" ? "text-emerald-400" : "text-destructive"}`}>
            {feedback.kind === "success" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {feedback.message}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">We’ll send a confirmation link to {currentUser.email}.</p>
        )}
        <Button type="button" size="sm" variant="outline" className="mt-3 border-primary/30 hover:bg-primary/10" onClick={resendVerificationEmail} disabled={isSending}>
          {isSending ? "Sending…" : "Resend email"}
        </Button>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss email verification reminder" className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}