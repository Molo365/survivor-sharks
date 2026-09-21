export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function normalizeDisplayName(raw: unknown): DisplayNameResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Display name must be text." };
  }

  if (/\p{Cc}/u.test(raw)) {
    return { ok: false, error: "Display name cannot contain control characters." };
  }

  const value = raw.trim().replace(/\s+/g, " ");

  if (value.length < 3 || value.length > 30) {
    return {
      ok: false,
      error: "Display name must be between 3 and 30 characters long.",
    };
  }

  if (/[<>]/.test(value)) {
    return { ok: false, error: "Display name cannot contain < or >." };
  }

  if (!/[\p{L}\p{N}]/u.test(value)) {
    return {
      ok: false,
      error: "Display name must include at least one letter or number.",
    };
  }

  return { ok: true, value };
}