export type RealNameResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Optional legal / table name shown only to pool members (not a public handle). */
export function normalizeRealName(raw: unknown): RealNameResult {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  if (typeof raw !== "string") {
    return { ok: false, error: "Real name must be text." };
  }

  if (/\p{Cc}/u.test(raw)) {
    return { ok: false, error: "Real name cannot contain control characters." };
  }

  const value = raw.trim().replace(/\s+/g, " ");

  if (value.length === 0) {
    return { ok: true, value: null };
  }

  if (value.length > 80) {
    return { ok: false, error: "Real name must be 80 characters or fewer." };
  }

  if (/[<>]/.test(value)) {
    return { ok: false, error: "Real name cannot contain < or >." };
  }

  if (!/[\p{L}\p{N}]/u.test(value)) {
    return {
      ok: false,
      error: "Real name must include at least one letter or number.",
    };
  }

  return { ok: true, value };
}
