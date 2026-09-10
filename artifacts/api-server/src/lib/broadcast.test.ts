import assert from "node:assert/strict";
import test from "node:test";

import { deliverBroadcastEmails } from "./broadcast-delivery";
import { normalizeBroadcastRecipients } from "./broadcast-recipients";
import { buildBroadcastEmail, BROADCAST_EMAIL_SUBJECT } from "./mailer";
import { getBroadcastAppBaseUrl } from "../routes/broadcast";

test("broadcast recipients require verification and deduplicate users and normalized emails", () => {
  const verifiedAt = new Date("2026-09-10T12:00:00Z");
  const result = normalizeBroadcastRecipients([
    { userId: 1, email: " Player@Example.com ", emailVerifiedAt: verifiedAt, username: "player", displayName: "Player One" },
    { userId: 1, email: "player@example.com", emailVerifiedAt: verifiedAt, username: "player", displayName: "Duplicate entry" },
    { userId: 2, email: "PLAYER@example.com", emailVerifiedAt: verifiedAt, username: "other", displayName: null },
    { userId: 3, email: "unverified@example.com", emailVerifiedAt: null, username: "unverified", displayName: null },
    { userId: 4, email: "   ", emailVerifiedAt: verifiedAt, username: "empty", displayName: null },
    { userId: 5, email: "eligible@example.com", emailVerifiedAt: verifiedAt, username: "eligible", displayName: null },
  ]);

  assert.deepEqual(result, {
    eligible: [
      { userId: 1, email: "player@example.com", displayName: "Player One" },
      { userId: 5, email: "eligible@example.com", displayName: "eligible" },
    ],
    skipped: 4,
  });
});

test("broadcast template escapes commissioner text and standings while preserving line breaks", () => {
  const content = buildBroadcastEmail(
    "Pool <One>",
    "First line\n<script>alert('x')</script>",
    {
      summary: { title: "Current <Standings>", asOf: "2026-09-10T12:00:00.000Z" },
      rows: [{
        rank: 1,
        displayName: "Player & One",
        status: "Active",
        primaryValue: 12,
        primaryLabel: "Correct <picks>",
      }],
    },
    "https://example.com/pools/1?x=<unsafe>",
  );

  assert.equal(content.subject, BROADCAST_EMAIL_SUBJECT);
  assert.doesNotMatch(content.html, /<script>/);
  assert.match(content.html, /First line<br \/>/);
  assert.match(content.html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.match(content.html, /Pool &lt;One&gt;/);
  assert.match(content.html, /Player &amp; One/);
  assert.match(content.html, /Correct &lt;picks&gt;/);
  assert.match(content.text, /First line\n<script>alert\('x'\)<\/script>/);
  assert.match(content.text, /1\. Player & One — Active — Correct <picks>: 12/);
});

test("broadcast delivery limits concurrency and reports individual failures", async () => {
  const recipients = Array.from({ length: 8 }, (_, index) => ({
    userId: index + 1,
    email: `player${index + 1}@example.com`,
    displayName: `Player ${index + 1}`,
  }));
  let active = 0;
  let maxActive = 0;
  const failedUsers: number[] = [];

  const result = await deliverBroadcastEmails(
    recipients,
    async (recipient) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      if (recipient.userId === 3 || recipient.userId === 7) throw new Error("provider unavailable");
    },
    3,
    (recipient) => failedUsers.push(recipient.userId),
  );

  assert.deepEqual(result, { sent: 6, failed: 2 });
  assert.ok(maxActive <= 3);
  assert.deepEqual(failedUsers.sort((a, b) => a - b), [3, 7]);
});

test("broadcast links require a configured canonical HTTP(S) app URL", () => {
  const previous = process.env.APP_URL;
  try {
    delete process.env.APP_URL;
    assert.throws(() => getBroadcastAppBaseUrl(), /APP_URL must be configured/);

    process.env.APP_URL = "javascript:alert(1)";
    assert.throws(() => getBroadcastAppBaseUrl(), /must use http or https/);

    process.env.APP_URL = "https://survivorsharks.example/app/?ignored=yes#fragment";
    assert.equal(getBroadcastAppBaseUrl(), "https://survivorsharks.example/app");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});