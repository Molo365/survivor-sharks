import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPicksConfirmationEmail,
  createPickConfirmationNumber,
} from "./mailer";
import {
  buildTeamPickConfirmationItems,
  buildThreeWayPickConfirmationItems,
  isSharedPickConfirmationSport,
  confirmationDeliveryState,
  failedConfirmationDeliveryState,
  makePickConfirmation,
  sendPicksConfirmationSafely,
} from "./pick-confirmation";

test("confirmation numbers are unique for every save", () => {
  const first = createPickConfirmationNumber();
  const second = createPickConfirmationNumber();
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.match(second, /^[0-9a-f-]{36}$/);
});

test("generic confirmation template renders one or many normalized picks", () => {
  const { subject, html } = buildPicksConfirmationEmail({
    toEmail: "player@example.com",
    username: "Player <One>",
    poolName: "Sunday & Monday",
    confirmationNumber: "confirm-123",
    submittedAt: new Date("2026-09-07T18:30:00Z"),
    picks: [
      {
        selection: "Toronto Sharks",
        matchup: "Toronto Sharks vs. Buffalo Bills",
        gameTime: "2026-09-08T00:15:00Z",
      },
      {
        selection: "Draw",
        matchup: "Barcelona at Arsenal",
        gameTime: "2026-09-09T19:00:00Z",
      },
    ],
  });

  assert.equal(subject, "Your picks are confirmed for Sunday & Monday");
  assert.match(html, /Toronto Sharks vs\. Buffalo Bills/);
  assert.match(html, />Draw</);
  assert.match(html, /Barcelona at Arsenal/);
  assert.match(html, /confirm-123/);
  assert.match(html, /Player &lt;One&gt;/);
  assert.match(html, /Sunday &amp; Monday/);
});

test("football and three-way submissions normalize accurate matchup details", () => {
  const games = [{
    id: "game-1",
    date: "2026-09-08T00:15:00Z",
    awayTeam: { id: "BUF", displayName: "Buffalo Bills" },
    homeTeam: { id: "TOR", displayName: "Toronto Sharks" },
  }];
  assert.deepEqual(
    buildTeamPickConfirmationItems(
      [{ gameId: "game-1", pickedTeamId: "TOR", pickedTeamName: "Toronto" }],
      games,
    ),
    [{
      selection: "Toronto Sharks",
      matchup: "Toronto Sharks vs. Buffalo Bills",
      gameTime: "2026-09-08T00:15:00Z",
    }],
  );
  assert.equal(
    buildThreeWayPickConfirmationItems(
      [{ gameId: "game-1", pickedTeamId: "away_win", pickedTeamName: "Away Win" }],
      games,
    )[0]?.selection,
    "Buffalo Bills win",
  );
  assert.equal(
    buildThreeWayPickConfirmationItems(
      [{ gameId: "game-1", pickedTeamId: "draw", pickedTeamName: "Draw" }],
      games,
    )[0]?.selection,
    "Draw",
  );
});

test("shared Pick-Em confirmation scope includes weekly soccer sports only", () => {
  assert.equal(isSharedPickConfirmationSport("mls"), true);
  assert.equal(isSharedPickConfirmationSport("superleague"), true);
  assert.equal(isSharedPickConfirmationSport("championsleague"), true);
  for (const sport of ["mlb", "nhl", "nba", "nfl", "worldcup"]) {
    assert.equal(isSharedPickConfirmationSport(sport), false);
  }
});

test("email provider failure is contained and reported without rejecting", async () => {
  const expected = new Error("provider unavailable");
  let reported: unknown;
  await assert.doesNotReject(() => sendPicksConfirmationSafely({
    toEmail: "player@example.com",
    username: "Player",
    poolName: "Test Pool",
    confirmationNumber: "confirm-456",
    submittedAt: new Date("2026-09-07T18:30:00Z"),
    picks: [{ selection: "Toronto Sharks" }],
  }, (error) => {
    reported = error;
  }, async () => {
    throw expected;
  }));
  assert.equal(reported, expected);
});

test("delivery terminal states preserve failed confirmations without affecting pick work", () => {
  assert.deepEqual(confirmationDeliveryState("provider-123"), {
    deliveryStatus: "sent", providerMessageId: "provider-123", failureReason: null,
  });
  assert.deepEqual(failedConfirmationDeliveryState(new Error("provider unavailable")), {
    deliveryStatus: "failed", providerMessageId: null, failureReason: "provider unavailable",
  });
});

test("resaves create independent immutable receipt snapshots", () => {
  const first = makePickConfirmation({
    toEmail: "player@example.com", username: "Player", poolName: "Pool",
    picks: [{ selection: "First team" }],
  });
  const second = makePickConfirmation({
    toEmail: "player@example.com", username: "Player", poolName: "Pool",
    picks: [{ selection: "Changed team" }],
  });
  assert.notEqual(first.confirmationNumber, second.confirmationNumber);
  assert.deepEqual(first.email.picks, [{ selection: "First team" }]);
  assert.deepEqual(second.email.picks, [{ selection: "Changed team" }]);
});