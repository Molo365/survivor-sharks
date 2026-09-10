import type { BroadcastRecipient } from "./broadcast-recipients";

export interface BroadcastDeliveryResult {
  sent: number;
  failed: number;
}

export async function deliverBroadcastEmails(
  recipients: BroadcastRecipient[],
  send: (recipient: BroadcastRecipient) => Promise<unknown>,
  concurrency = 5,
  onFailure?: (recipient: BroadcastRecipient, error: unknown) => void,
): Promise<BroadcastDeliveryResult> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), recipients.length));
  let nextIndex = 0;
  let sent = 0;
  let failed = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= recipients.length) return;

      const recipient = recipients[index];
      try {
        await send(recipient);
        sent++;
      } catch (error) {
        failed++;
        onFailure?.(recipient, error);
      }
    }
  });

  await Promise.all(workers);
  return { sent, failed };
}