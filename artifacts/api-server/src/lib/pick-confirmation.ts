import {
  createPickConfirmationNumber,
  sendPicksConfirmationEmail,
  type PickConfirmationItem,
  type PicksConfirmationEmailInput,
} from "./mailer";
import { db, pickConfirmationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export type PickConfirmationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ConfirmationGame {
  id: string;
  date: string;
  homeTeam: { id: string; displayName: string };
  awayTeam: { id: string; displayName: string };
}

export interface SubmittedConfirmationPick {
  gameId: string;
  pickedTeamId: string;
  pickedTeamName: string;
}

export interface PersistedPickConfirmation {
  confirmationNumber: string;
  submittedAt: Date;
  email: PicksConfirmationEmailInput;
}

export function makePickConfirmation(input: Omit<PicksConfirmationEmailInput, "confirmationNumber" | "submittedAt">): PersistedPickConfirmation {
  const submittedAt = new Date();
  return {
    confirmationNumber: createPickConfirmationNumber(),
    submittedAt,
    email: { ...input, confirmationNumber: "", submittedAt },
  };
}

export function confirmationDeliveryState(providerMessageId: string | null): {
  deliveryStatus: "sent"; providerMessageId: string | null; failureReason: null;
} {
  return { deliveryStatus: "sent", providerMessageId, failureReason: null };
}

export function failedConfirmationDeliveryState(error: unknown): {
  deliveryStatus: "failed"; providerMessageId: null; failureReason: string;
} {
  return {
    deliveryStatus: "failed",
    providerMessageId: null,
    failureReason: error instanceof Error ? error.message : String(error),
  };
}

/** Must be called using the transaction which writes the associated picks. */
export async function insertPickConfirmation(
  tx: PickConfirmationTransaction,
  data: PersistedPickConfirmation,
  context: { userId: number; poolId: number; poolType: string; sport: string; periodKey: string },
): Promise<void> {
  await tx.insert(pickConfirmationsTable).values({
    confirmationId: data.confirmationNumber,
    userId: context.userId,
    poolId: context.poolId,
    poolType: context.poolType,
    sport: context.sport,
    periodKey: context.periodKey,
    submittedAt: data.submittedAt,
    recipientEmail: data.email.toEmail,
    picksSnapshot: data.email.picks,
  });
}

/** Queue only after the surrounding transaction commits; it never reads mutable picks. */
export function deliverPickConfirmation(
  data: PersistedPickConfirmation,
  context: Record<string, unknown>,
  sender: (input: PicksConfirmationEmailInput) => Promise<string | null> = sendPicksConfirmationEmail,
): void {
  void (async () => {
    let providerMessageId: string | null;
    try {
      providerMessageId = await sender({ ...data.email, confirmationNumber: data.confirmationNumber });
    } catch (error) {
      try {
        await db.update(pickConfirmationsTable).set(failedConfirmationDeliveryState(error))
          .where(eq(pickConfirmationsTable.confirmationId, data.confirmationNumber));
      } catch (statusError) {
        logger.error(
          { err: statusError, deliveryError: error, ...context, confirmationNumber: data.confirmationNumber },
          "Pick confirmation delivery and status update failed",
        );
        return;
      }
      logger.error(
        { err: error, ...context, confirmationNumber: data.confirmationNumber },
        "Pick confirmation email failed",
      );
      return;
    }

    try {
      await db.update(pickConfirmationsTable).set(confirmationDeliveryState(providerMessageId))
        .where(eq(pickConfirmationsTable.confirmationId, data.confirmationNumber));
    } catch (statusError) {
      logger.error(
        { err: statusError, ...context, confirmationNumber: data.confirmationNumber, providerMessageId },
        "Pick confirmation was sent but its delivery status update failed",
      );
    }
  })();
}

export function isSharedPickConfirmationSport(sport: string): boolean {
  return sport === "superleague" || sport === "championsleague";
}

export function buildTeamPickConfirmationItems(
  picks: SubmittedConfirmationPick[],
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  const gameMap = new Map(games.map((game) => [game.id, game]));
  return picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const pickedIsHome = game?.homeTeam.id === pick.pickedTeamId;
    const pickedIsAway = game?.awayTeam.id === pick.pickedTeamId;
    const selection = pickedIsHome
      ? game.homeTeam.displayName
      : pickedIsAway
        ? game.awayTeam.displayName
        : pick.pickedTeamName;
    const opponent = pickedIsHome
      ? game?.awayTeam.displayName
      : pickedIsAway
        ? game?.homeTeam.displayName
        : null;
    return {
      selection,
      matchup: opponent ? `${selection} vs. ${opponent}` : null,
      gameTime: game?.date ?? null,
    };
  });
}

export function buildThreeWayPickConfirmationItems(
  picks: SubmittedConfirmationPick[],
  games: ConfirmationGame[],
): PickConfirmationItem[] {
  const gameMap = new Map(games.map((game) => [game.id, game]));
  return picks.map((pick) => {
    const game = gameMap.get(pick.gameId);
    const selection = pick.pickedTeamId === "draw"
      ? "Draw"
      : pick.pickedTeamId === "home_win"
        ? `${game?.homeTeam.displayName ?? "Home team"} win`
        : pick.pickedTeamId === "away_win"
          ? `${game?.awayTeam.displayName ?? "Away team"} win`
          : pick.pickedTeamName;
    return {
      selection,
      matchup: game
        ? `${game.awayTeam.displayName} at ${game.homeTeam.displayName}`
        : null,
      gameTime: game?.date ?? null,
    };
  });
}

export async function sendPicksConfirmationSafely(
  input: PicksConfirmationEmailInput,
  onError: (error: unknown) => void,
  sender: (input: PicksConfirmationEmailInput) => Promise<unknown> = sendPicksConfirmationEmail,
): Promise<void> {
  try {
    await sender(input);
  } catch (error) {
    onError(error);
  }
}