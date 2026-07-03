import { useState } from "react";
import { useLocation } from "wouter";
import { useGetPool, getGetPoolQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OctagonX } from "lucide-react";

interface CancelPoolButtonProps {
  poolId: number;
}

export function CancelPoolButton({ poolId }: CancelPoolButtonProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pool } = useGetPool(poolId);

  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  if (!pool || !user) return null;
  if (pool.commissionerId !== user.id && user.role !== "admin") return null;
  if (!pool.isActive) return null;

  const nameMatches = confirmName.trim() === pool.name.trim();

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setConfirmName("");
      setBlockedMessage(null);
    }
  };

  const handleCancel = async () => {
    if (!nameMatches) return;
    setLoading(true);
    setBlockedMessage(null);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pools/${poolId}/cancel`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(poolId) });
        toast({
          title: "Pool cancelled",
          description: `"${pool.name}" has been cancelled.`,
        });
        setOpen(false);
        navigate("/dashboard");
      } else {
        const data = await res.json();
        if (res.status === 409) {
          setBlockedMessage(data.error ?? "Cannot cancel: other members have already submitted picks.");
        } else if (res.status === 403) {
          setBlockedMessage("You are not authorized to cancel this pool.");
        } else {
          setBlockedMessage(data.error ?? "Something went wrong. Please try again.");
        }
      }
    } catch {
      setBlockedMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/30 bg-[linear-gradient(145deg,rgba(220,38,38,0.05)_0%,rgba(10,14,26,1)_100%)]">
      <CardHeader>
        <CardTitle className="font-bebas text-2xl tracking-wide text-destructive flex items-center gap-2">
          <OctagonX className="w-5 h-5" /> Cancel Pool
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Cancel this pool. Only possible while no other member has submitted a pick.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={handleOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full font-bebas text-xl tracking-wider h-12">
              <OctagonX className="w-5 h-5 mr-2" /> Cancel Pool
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel &ldquo;{pool.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark the pool as cancelled and inactive. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {blockedMessage ? (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                {blockedMessage}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Type <span className="font-mono font-bold text-foreground">{pool.name}</span> to confirm
                </Label>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={pool.name}
                  className="bg-background/50 border-border"
                  autoComplete="off"
                />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setConfirmName(""); setBlockedMessage(null); }}>
                {blockedMessage ? "Close" : "Back"}
              </AlertDialogCancel>
              {!blockedMessage && (
                <Button
                  onClick={handleCancel}
                  disabled={!nameMatches || loading}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bebas text-xl tracking-wider"
                >
                  {loading ? "Cancelling…" : "Cancel Pool"}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
