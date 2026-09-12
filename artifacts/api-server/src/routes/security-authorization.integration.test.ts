import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, entriesTable, poolsTable, usersTable } from "@workspace/db";
import app from "../app";
import { signToken } from "../lib/jwt";

type ResponseBody = { error?: string; [key: string]: unknown };

const suffix = `security-auth-${crypto.randomUUID()}`;
const poolIds: number[] = [];
let commissionerId: number;
let commissionerToken: string;
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let testPools: Record<string, number>;
let previousPoolCreationOpen: string | undefined;
let previousAppUrl: string | undefined;

async function insertPool(values: {
  name: string;
  sport: NonNullable<typeof poolsTable.$inferInsert["sport"]>;
  poolType: NonNullable<typeof poolsTable.$inferInsert["poolType"]>;
  sandboxMode: boolean;
}) {
  const [pool] = await db.insert(poolsTable).values({
    ...values,
    inviteCode: `${suffix}-${poolIds.length}`,
    commissionerId,
    currentWeek: 1,
    season: 2025,
    isActive: true,
  }).returning();
  if (!pool) throw new Error(`Failed to create ${values.poolType} fixture`);
  poolIds.push(pool.id);
  return pool;
}

async function request(method: string, path: string, body: unknown): Promise<{
  status: number;
  body: ResponseBody;
}> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${commissionerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json() as ResponseBody,
  };
}

async function assertForbidden(label: string, method: string, path: string, body: unknown) {
  const response = await request(method, path, body);
  assert.equal(response.status, 403, `${label} should reject a non-admin commissioner`);
  assert.ok(response.body.error, `${label} should return an error message`);
}

before(async () => {
  previousPoolCreationOpen = process.env.POOL_CREATION_OPEN;
  previousAppUrl = process.env.APP_URL;
  process.env.POOL_CREATION_OPEN = "true";
  process.env.APP_URL = "https://security-test.example";

  const [user] = await db.insert(usersTable).values({
    username: `${suffix}-commissioner`,
    email: `${suffix}@example.test`,
    passwordHash: "test-only",
    role: "user",
  }).returning();
  if (!user) throw new Error("Failed to create commissioner fixture");
  commissionerId = user.id;
  commissionerToken = signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
  });

  const survivorPool = await insertPool({
    name: `${suffix}-survivor`,
    sport: "nfl",
    poolType: "season",
    sandboxMode: false,
  });
  const ndpPool = await insertPool({
    name: `${suffix}-ndp`,
    sport: "nfl",
    poolType: "nfl_division_predictor",
    sandboxMode: false,
  });
  const pickemSeasonPool = await insertPool({
    name: `${suffix}-pickem-season`,
    sport: "nfl",
    poolType: "pickem_season",
    sandboxMode: false,
  });
  await insertPool({
    name: `${suffix}-mlb-bracket`,
    sport: "mlb",
    poolType: "mlb_bracket",
    sandboxMode: true,
  });
  const replayPool = await insertPool({
    name: `${suffix}-replay`,
    sport: "nfl",
    poolType: "pickem_season",
    sandboxMode: true,
  });
  const atsPool = await insertPool({
    name: `${suffix}-ats`,
    sport: "nba",
    poolType: "nba_ats",
    sandboxMode: true,
  });

  await db.insert(entriesTable).values({
    poolId: survivorPool.id,
    userId: commissionerId,
    status: "alive",
  });

  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not open a TCP port");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}/api`;

  testPools = {
    survivor: survivorPool.id,
    ndp: ndpPool.id,
    pickemSeason: pickemSeasonPool.id,
    mlbBracket: poolIds[3]!,
    replay: replayPool.id,
    ats: atsPool.id,
  };
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  if (poolIds.length) {
    await db.delete(poolsTable).where(inArray(poolsTable.id, poolIds));
  }
  if (commissionerId) {
    await db.delete(usersTable).where(eq(usersTable.id, commissionerId));
  }
  if (previousPoolCreationOpen === undefined) delete process.env.POOL_CREATION_OPEN;
  else process.env.POOL_CREATION_OPEN = previousPoolCreationOpen;
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

test("rejects sandboxMode on generic pool PATCH for the pool commissioner", async () => {
  const response = await request("PATCH", `/pools/${testPools.survivor}`, { sandboxMode: true });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Only admins can change sandbox mode.");
});

test("rejects sandbox pool creation for a non-admin NFL commissioner", async () => {
  const response = await request("POST", "/pools", {
    name: `${suffix}-blocked-nfl`,
    sport: "nfl",
    poolType: "season",
    sandboxMode: true,
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Only admins can create sandbox pools.");
});

test("rejects sandbox pool creation for a non-admin MLB commissioner", async () => {
  const response = await request("POST", "/pools", {
    name: `${suffix}-blocked-mlb`,
    sport: "mlb",
    poolType: "season",
    sandboxMode: true,
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Only admins can create sandbox pools.");
});

test("rejects Survivor simulation for a non-admin commissioner", async () => {
  await assertForbidden("Survivor simulation", "POST", `/pools/${testPools.survivor}/picks/simulate-grading`, { week: 1 });
});

test("rejects manual Survivor results for a non-admin commissioner", async () => {
  await assertForbidden("manual Survivor results", "POST", `/pools/${testPools.survivor}/results`, {
    week: 1,
    losingTeamIds: [],
  });
});

test("rejects NFL Division Predictor simulation for a non-admin commissioner", async () => {
  await assertForbidden("NDP simulation", "POST", `/pools/${testPools.ndp}/ndp/simulate-standings`, {});
});

test("rejects Pick-Em Season sandbox-week changes for a non-admin commissioner", async () => {
  await assertForbidden("Pick-Em Season sandbox week", "PATCH", `/pools/${testPools.pickemSeason}/pickem-season/sandbox-week`, { week: 1 });
});

test("rejects Pick-Em Season simulation for a non-admin commissioner", async () => {
  await assertForbidden("Pick-Em Season simulation", "POST", `/pools/${testPools.pickemSeason}/pickem-season/simulate-grading`, { week: 1 });
});

test("rejects both MLB bracket simulations for a non-admin commissioner", async () => {
  await assertForbidden("MLB bracket next-round simulation", "POST", `/pools/${testPools.mlbBracket}/mlb-bracket/sandbox/simulate-next-round`, {});
  await assertForbidden("MLB bracket full simulation", "POST", `/pools/${testPools.mlbBracket}/mlb-bracket/sandbox/simulate-full`, {});
});

test("rejects Replay Mode start for a non-admin commissioner", async () => {
  await assertForbidden("Replay Mode start", "POST", `/pools/${testPools.replay}/replay/start`, {
    week: 1,
    startTime: "2025-09-01T12:00:00.000Z",
  });
});

test("keeps broadcast email accessible to the pool commissioner", async () => {
  const response = await request("POST", `/pools/${testPools.survivor}/broadcast-email`, {});
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Message is required");
});

test("keeps NBA ATS spread entry accessible to the pool commissioner", async () => {
  const response = await request("POST", `/pools/${testPools.ats}/pickem/ats-spreads`, { spreads: [] });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "spreads must be a non-empty array");
});