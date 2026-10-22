const ALLOWED_RETURN_PREFIXES = [
  "/dashboard",
  "/pools/",
  "/picks",
  "/standings",
  "/scores",
  "/profile",
  "/past-pools",
  "/feedback",
];

/** Internal path only — blocks open redirects. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let path = raw.trim();
  if (!path) return null;
  try {
    if (path.includes("%")) path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.split("#", 1)[0] ?? path;
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("..") || path.includes("\\")) return null;
  if (path.length > 256) return null;
  const ok = ALLOWED_RETURN_PREFIXES.some(
    (prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix),
  );
  return ok ? path : null;
}

export function loginPathWithReturnTo(returnTo: string): string {
  const safe = sanitizeReturnTo(returnTo);
  return safe ? `/login?returnTo=${encodeURIComponent(safe)}` : "/login";
}
