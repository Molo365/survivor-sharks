import { db, entriesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface BroadcastRecipient {
  userId: number;
  email: string;
  displayName: string;
}

export interface BroadcastRecipientCandidate {
  userId: number;
  email: string;
  emailVerifiedAt: Date | null;
  username: string;
  displayName: string | null;
}

export function normalizeBroadcastRecipients(
  candidates: BroadcastRecipientCandidate[],
): { eligible: BroadcastRecipient[]; skipped: number } {
  const eligible: BroadcastRecipient[] = [];
  const seenUserIds = new Set<number>();
  const seenEmails = new Set<string>();
  let skipped = 0;

  for (const candidate of candidates) {
    const normalizedEmail = candidate.email.trim().toLowerCase();
    if (
      !normalizedEmail ||
      candidate.emailVerifiedAt === null ||
      seenUserIds.has(candidate.userId) ||
      seenEmails.has(normalizedEmail)
    ) {
      skipped++;
      continue;
    }

    seenUserIds.add(candidate.userId);
    seenEmails.add(normalizedEmail);
    eligible.push({
      userId: candidate.userId,
      email: normalizedEmail,
      displayName: candidate.displayName?.trim() || candidate.username,
    });
  }

  return { eligible, skipped };
}

export async function resolveBroadcastRecipients(
  poolId: number,
): Promise<{ eligible: BroadcastRecipient[]; skipped: number }> {
  const candidates = await db
    .select({
      userId: entriesTable.userId,
      email: usersTable.email,
      emailVerifiedAt: usersTable.emailVerifiedAt,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(entriesTable)
    .innerJoin(usersTable, eq(entriesTable.userId, usersTable.id))
    .where(eq(entriesTable.poolId, poolId));

  return normalizeBroadcastRecipients(candidates);
}