import { Link } from "wouter";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { AlertCircle, LogOut, LayoutDashboard } from "lucide-react";

type PoolNonMemberNoticeProps = {
  poolId: number;
  poolName: string;
  inviteCode: string;
  signedInLabel: string;
};

export function PoolNonMemberNotice({
  poolId,
  poolName,
  inviteCode,
  signedInLabel,
}: PoolNonMemberNoticeProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <NavBar />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="text-center p-8 sm:p-12 bg-muted/20 border border-border/50 rounded-xl max-w-lg space-y-6">
          <div className="w-14 h-14 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-amber-400" />
          </div>
          <div className="space-y-2">
            <h2 className="font-bebas text-3xl sm:text-4xl tracking-wide text-foreground">
              Wrong account for this pool
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You opened a link for <span className="font-medium text-foreground">{poolName}</span> (pool #{poolId}),
              but you&apos;re signed in as <span className="font-medium text-foreground">{signedInLabel}</span>.
              That account is not enrolled in this pool, so picks and standings cannot load here.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Pick reminders are sent to the email on the account that joined the pool. Sign out and log in with the
              account that received the reminder, or use your dashboard if this pool is listed there.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/dashboard">
              <Button className="w-full sm:w-auto gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Go to dashboard
              </Button>
            </Link>
            <Link href={`/login?returnTo=${encodeURIComponent(`/pools/${poolId}`)}`}>
              <Button variant="outline" className="w-full sm:w-auto gap-2">
                <LogOut className="w-4 h-4" />
                Switch account
              </Button>
            </Link>
          </div>
          <p className="text-[11px] text-muted-foreground/70 pt-2">
            Need to join with this account instead?{" "}
            <Link href={`/join/${inviteCode}`} className="text-primary hover:underline font-medium">
              Open the pool invite
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
