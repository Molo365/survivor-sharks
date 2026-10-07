export type PoolMemberLike = {
  userId: number;
  username: string;
  displayName?: string | null;
  realName?: string | null;
};

export function poolMemberStageName(member: PoolMemberLike): string {
  return member.displayName?.trim() || member.username;
}

export function poolMemberLookup(
  members: PoolMemberLike[] | undefined,
  userId: number,
): PoolMemberLike | undefined {
  return members?.find((m) => m.userId === userId);
}
