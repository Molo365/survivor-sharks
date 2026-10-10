export type PoolMemberLike = {
  userId: number;
  username: string;
  displayName?: string | null;
  realName?: string | null;
};

export function poolMemberStageName(member: PoolMemberLike): string {
  return member.displayName?.trim() || member.username;
}

/** Name shown in People list / member sheet: profile real name, else signup username. */
export function poolMemberRealName(member: PoolMemberLike): string {
  const real = member.realName?.trim();
  if (real) return real;
  const username = member.username?.trim();
  if (username) return username;
  return "Unknown player";
}

export function poolMemberHasRealNameOverride(member: PoolMemberLike): boolean {
  return Boolean(member.realName?.trim());
}

export function poolMemberLookup(
  members: PoolMemberLike[] | undefined,
  userId: number,
): PoolMemberLike | undefined {
  return members?.find((m) => m.userId === userId);
}
