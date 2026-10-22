import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type EnvPresence = {
  databaseUrl: boolean;
  sessionSecret: boolean;
  resendApiKey: boolean;
  appUrl: boolean;
  apiFootballKey: boolean;
};

export function envPresence(): EnvPresence {
  return {
    databaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    sessionSecret: Boolean(process.env.SESSION_SECRET?.trim()),
    resendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
    appUrl: Boolean(process.env.APP_URL?.trim()),
    apiFootballKey: Boolean(process.env.API_FOOTBALL_KEY?.trim()),
  };
}

export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.execute(sql`select 1 as ok`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "database query failed" };
  }
}

/** ESPN public scoreboard — no API key in this app. */
export async function checkEspnNflScoreboard(): Promise<{ ok: boolean; eventCount: number; error?: string }> {
  const url =
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=1&seasontype=2&limit=5";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      return { ok: false, eventCount: 0, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { events?: unknown[] };
    const eventCount = data.events?.length ?? 0;
    return { ok: eventCount > 0, eventCount, error: eventCount > 0 ? undefined : "empty events array" };
  } catch (err) {
    return {
      ok: false,
      eventCount: 0,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}
