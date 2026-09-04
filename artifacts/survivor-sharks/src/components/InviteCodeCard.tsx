import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, ShieldCheck } from "lucide-react";

export function InviteCodeCard({ inviteCode }: { inviteCode?: string | null }) {
  const { toast } = useToast();

  const copyInviteCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      toast({ title: "Invite code copied!" });
    });
  };

  const copyInviteLink = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`).then(() => {
      toast({ title: "Invite link copied!", description: "Share it with anyone to let them join." });
    });
  };

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Invite Code
        </CardTitle>
        <CardDescription>Share this code so players can join your pool.</CardDescription>
      </CardHeader>
      <CardContent>
        {inviteCode ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-background border border-primary/20 px-8 py-4 rounded-md font-mono text-3xl tracking-widest text-foreground font-bold">
              {inviteCode}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={copyInviteCode} className="font-bebas text-xl tracking-wider" data-testid="button-copy-invite-code">
                <Copy className="w-5 h-5 mr-2" /> Copy Code
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="font-bebas text-xl tracking-wider border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                onClick={copyInviteLink}
                data-testid="button-copy-invite-link"
              >
                <Copy className="w-5 h-5 mr-2" /> Copy Invite Link
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No invite code set.</p>
        )}
      </CardContent>
    </Card>
  );
}