import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const MAX_BROADCAST_MESSAGE_LENGTH = 5000;

const SUPPORTED_BROADCAST_POOL_TYPES = new Set([
  "season",
  "weekly",
  "mid_season",
  "dirty_dozen",
  "pickem_season",
  "nfl_confidence",
  "nfl_confidence_weekly",
  "nfl_division_predictor",
]);

export function isBroadcastEmailSupported(sport: string | null | undefined, poolType: string | null | undefined): boolean {
  return sport === "nfl" && !!poolType && SUPPORTED_BROADCAST_POOL_TYPES.has(poolType);
}

interface BroadcastEmailDialogProps {
  poolId: number;
  sport: string | null | undefined;
  poolType: string | null | undefined;
}

interface BroadcastEmailResult {
  sent: number;
  skipped: number;
  failed: number;
}

async function getBroadcastError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    if (body.error || body.message) return body.error ?? body.message ?? "Unable to send the pool update.";
  } catch {
    // Fall through to a status-based message for non-JSON responses.
  }

  return response.statusText
    ? `Unable to send the pool update (${response.status} ${response.statusText}).`
    : `Unable to send the pool update (${response.status}).`;
}

export function BroadcastEmailDialog({ poolId, sport, poolType }: BroadcastEmailDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  if (!isBroadcastEmailSupported(sport, poolType)) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setMessage("");
      setError(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/pools/${poolId}/broadcast-email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmedMessage }),
      });

      if (!response.ok) {
        throw new Error(await getBroadcastError(response));
      }

      const result = await response.json() as Partial<BroadcastEmailResult>;
      const sent = Number.isFinite(result.sent) ? Number(result.sent) : 0;
      const skipped = Number.isFinite(result.skipped) ? Number(result.skipped) : 0;
      const failed = Number.isFinite(result.failed) ? Number(result.failed) : 0;

      toast({
        title: "Pool update sent",
        description: `Sent to ${sent} members. ${skipped} skipped, ${failed} failed.`,
      });
      setOpen(false);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the pool update. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Card className="border-primary/30 bg-card/60">
        <CardHeader>
          <CardTitle className="font-bebas text-2xl tracking-wide flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" /> Pool Update
          </CardTitle>
          <CardDescription>
            Send a message and the current standings to every member of this pool.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="font-bebas text-xl tracking-wider"
          >
            <Send className="w-5 h-5" /> Send Update to Pool
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="font-bebas text-3xl tracking-wider">Send Update to Pool</DialogTitle>
            <DialogDescription>
              Your message will be sent to every member of this pool along with the current standings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Textarea
                autoFocus
                value={message}
                maxLength={MAX_BROADCAST_MESSAGE_LENGTH}
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="Write your update to the pool..."
                className="min-h-[180px] bg-background/50 border-border resize-y"
                aria-label="Pool update message"
                disabled={isSending}
              />
              <div className="flex justify-end text-xs text-muted-foreground tabular-nums">
                {message.length.toLocaleString()} / {MAX_BROADCAST_MESSAGE_LENGTH.toLocaleString()}
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!message.trim() || isSending}
                className="font-bebas text-lg tracking-wider"
              >
                <Send className="w-4 h-4" />
                {isSending ? "Sending…" : "Send Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}