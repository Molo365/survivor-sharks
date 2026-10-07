import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function slugifyUsernameBase(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (s.length >= 3) return s.slice(0, 24);
  return `user_${s || "member"}`.slice(0, 24);
}

async function isUsernameTaken(username: string): Promise<boolean> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);
  return Boolean(row);
}

export async function pickAvailableUsername(base: string): Promise<string> {
  const root = slugifyUsernameBase(base);
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root.slice(0, 18)}_${i}`;
    if (candidate.length < 3) continue;
    if (!(await isUsernameTaken(candidate))) return candidate;
  }
  return `user_${Date.now().toString(36)}`;
}

/** Internal login id; users sign in with email. */
export async function generateRegisterUsername(email: string, realName: string): Promise<string> {
  const local = email.split("@")[0] ?? "user";
  const fromEmail = slugifyUsernameBase(local);
  if (fromEmail.length >= 3 && !(await isUsernameTaken(fromEmail))) {
    return fromEmail;
  }
  const fromName = slugifyUsernameBase(realName.replace(/\s+/g, "_"));
  return pickAvailableUsername(fromName.length >= 3 ? fromName : fromEmail);
}
