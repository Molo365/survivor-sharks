import { sanitizeReturnTo } from "@workspace/api-client-react";

const RETURN_TO_STORAGE_KEY = "post_auth_return_to";

export { sanitizeReturnTo };

/** Wouter v3 `useLocation()` is pathname-only; read `?returnTo=` from the browser when needed. */
function returnToQueryString(location: string): string {
  const fromLocation = location.split("?", 2)[1];
  if (fromLocation) return fromLocation;
  if (typeof window !== "undefined" && window.location.search) {
    return window.location.search.replace(/^\?/, "");
  }
  return "";
}

export function getReturnToFromLocation(location: string): string | null {
  const query = returnToQueryString(location);
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
