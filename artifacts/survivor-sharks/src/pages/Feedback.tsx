import { useState } from "react";
import { Link } from "wouter";
import { useSendFeedback } from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2, MessageSquare } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const MAX_MESSAGE_LENGTH = 5000;

export default function Feedback() {
  const sendFeedback = useSendFeedback();
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || sendFeedback.isPending) return;

    sendFeedback.mutate(
      { data: { message: trimmedMessage } },
      {
        onSuccess: () => {
          setMessage("");
          setSubmitted(true);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="container max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            data-testid="feedback-back-profile"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Profile
          </Link>
        </div>

        <Card className="shark-card">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-8 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <MessageSquare className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-bebas text-3xl tracking-widest text-foreground">
                  Contact &amp; Feedback
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Have a question, spotted a bug, or have an idea? Send a note directly to the Survivor Sharks team.
                </p>
              </div>
            </div>

            {submitted ? (
              <div
                className="rounded-lg border border-green-500/30 bg-green-500/10 p-6 text-center"
                role="status"
                data-testid="feedback-success"
              >
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" aria-hidden="true" />
                <h2 className="mt-3 font-bebas text-2xl tracking-wider text-foreground">
                  Thanks, we got your message
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We&apos;ll take a look and get back to you if needed.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5"
                  onClick={() => setSubmitted(false)}
                  data-testid="feedback-send-another"
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
                    Your message
                  </label>
                  <Textarea
                    id="feedback-message"
                    data-testid="feedback-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Tell us what happened or what you need help with..."
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={8}
                    required
                    disabled={sendFeedback.isPending}
                    className="resize-y bg-background/50"
                  />
                  <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                    <span>Messages are limited to {MAX_MESSAGE_LENGTH.toLocaleString()} characters.</span>
                    <span>{message.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}</span>
                  </div>
                </div>

                {sendFeedback.isError && (
                  <p className="text-sm text-destructive" role="alert" data-testid="feedback-error">
                    {sendFeedback.error.message || "We couldn't send your message. Please try again."}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={!message.trim() || sendFeedback.isPending}
                  className="w-full sm:w-auto"
                  data-testid="feedback-submit"
                >
                  {sendFeedback.isPending ? "Sending..." : "Send message"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}