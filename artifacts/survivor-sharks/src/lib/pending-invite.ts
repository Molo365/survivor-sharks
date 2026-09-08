export const PENDING_INVITE_KEY = "pending_invite_code";

export function normalizeInviteCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

export function getInviteFromLocation(location: string): string | null {
  const query = location.split("?", 2)[1] ?? "";
  return normalizeInviteCode(new URLSearchParams(query).get("invite"));
}

export function getPendingInviteCode(location: string): string | null {
  return getInviteFromLocation(location) ?? normalizeInviteCode(localStorage.getItem(PENDING_INVITE_KEY));
}

export function rememberPendingInvite(inviteCode: string): string {
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) return "";
  localStorage.setItem(PENDING_INVITE_KEY, normalized);
  return normalized;
}

export function clearPendingInvite(): void {
  localStorage.removeItem(PENDING_INVITE_KEY);
}

export function authPath(path: "/login" | "/register", inviteCode: string): string {
  const normalized = rememberPendingInvite(inviteCode);
  return normalized ? `${path}?invite=${encodeURIComponent(normalized)}` : path;
}

export function continuationPath(inviteCode: string): string {
  const normalized = rememberPendingInvite(inviteCode);
  return normalized ? `/auth/continue?invite=${encodeURIComponent(normalized)}` : "/dashboard";
}