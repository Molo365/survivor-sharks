const RETURN_TO_STORAGE_KEY = "post_auth_return_to";

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

export function getReturnToFromLocation(location: string): string | null {
  const query = location.split("?", 2)[1] ?? "";
  return sanitizeReturnTo(new URLSearchParams(query).get("returnTo"));
}

export function rememberReturnTo(path: string | null | undefined): string | null {
  const safe = sanitizeReturnTo(path);
  if (!safe) return null;
  try {
    sessionStorage.setItem(RETURN_TO_STORAGE_KEY, safe);
  } catch {
    /* ignore */
  }
  return safe;
}

export function rememberReturnToFromLocation(location: string): string | null {
  return rememberReturnTo(getReturnToFromLocation(location));
}

export function getStoredReturnTo(): string | null {
  try {
    return sanitizeReturnTo(sessionStorage.getItem(RETURN_TO_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStoredReturnTo(): void {
  try {
    sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loginPathWithReturn(returnTo: string): string {
  const safe = sanitizeReturnTo(returnTo);
  return safe ? `/login?returnTo=${encodeURIComponent(safe)}` : "/login";
}

/** After login/register: invite flow wins, then returnTo, then dashboard. */
export function resolvePostAuthDestination(
  location: string,
  hasPendingInvite: boolean,
): string {
  if (hasPendingInvite) return "/dashboard";
  const fromUrl = getReturnToFromLocation(location);
  if (fromUrl) {
    clearStoredReturnTo();
    return fromUrl;
  }
  const stored = getStoredReturnTo();
  if (stored) {
    clearStoredReturnTo();
    return stored;
  }
  return "/dashboard";
}

export function appendReturnToQuery(path: "/login" | "/register", location: string, inviteCode?: string | null): string {
  const params = new URLSearchParams();
  const normalizedInvite = inviteCode?.trim().toUpperCase();
  if (normalizedInvite) params.set("invite", normalizedInvite);
  const returnTo = getReturnToFromLocation(location) ?? getStoredReturnTo();
  if (returnTo) params.set("returnTo", returnTo);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
