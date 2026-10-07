import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import { Users, UserCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetPool, getGetPoolQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  poolMemberStageName,
  type PoolMemberLike,
} from "@/lib/poolMemberDisplay";

export type MemberSheetExtras = {
  rank?: number | null;
  rankLabel?: string;
  subtitle?: string;
};

type PoolMemberIdentityContextValue = {
  membersByUserId: Map<number, PoolMemberLike>;
  currentUserId: number | undefined;
  openMember: (userId: number, extras?: MemberSheetExtras) => void;
  openParticipants: () => void;
  getStageName: (userId: number, fallback?: string) => string;
};

const PoolMemberIdentityContext =
  createContext<PoolMemberIdentityContextValue | null>(null);

export function usePoolMemberIdentity(): PoolMemberIdentityContextValue | null {
  return useContext(PoolMemberIdentityContext);
}

function mergeMembersWithAuthRealName(
  members: PoolMemberLike[],
  userId: number | undefined,
  realName: string | null | undefined,
): PoolMemberLike[] {
  if (userId == null || !realName?.trim()) return members;
  return members.map((m) =>
    m.userId === userId ? { ...m, realName: realName.trim() } : m,
  );
}

export function PoolMemberIdentityProvider({
  poolId,
  currentUserId,
  children,
}: {
  poolId: number;
  currentUserId?: number;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: pool } = useGetPool(poolId, {
    query: { enabled: poolId > 0, queryKey: getGetPoolQueryKey(poolId) },
  });

  const members = useMemo(
    () =>
      mergeMembersWithAuthRealName(
        pool?.members ?? [],
        user?.id,
        user?.realName,
      ),
    [pool?.members, user?.id, user?.realName],
  );

  const [profileOpen, setProfileOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [sheetExtras, setSheetExtras] = useState<MemberSheetExtras | undefined>();

  const refreshPoolMembers = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: getGetPoolQueryKey(poolId) });
  }, [poolId, queryClient]);

  const membersByUserId = useMemo(
    () => new Map(members.map((m) => [m.userId, m])),
    [members],
  );

  const getStageName = useCallback(
    (userId: number, fallback = "Player") => {
      const m = membersByUserId.get(userId);
      return m ? poolMemberStageName(m) : fallback;
    },
    [membersByUserId],
  );

  const openMember = useCallback(
    (userId: number, extras?: MemberSheetExtras) => {
      refreshPoolMembers();
      setSelectedUserId(userId);
      setSheetExtras(extras);
      setProfileOpen(true);
    },
    [refreshPoolMembers],
  );

  const openParticipants = useCallback(() => {
    refreshPoolMembers();
    setParticipantsOpen(true);
  }, [refreshPoolMembers]);

  const selectedMember =
    selectedUserId != null ? membersByUserId.get(selectedUserId) : undefined;
  const isYou = selectedUserId != null && selectedUserId === currentUserId;
  const selectedRealName = selectedMember?.realName?.trim() ?? "";

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        poolMemberStageName(a).localeCompare(poolMemberStageName(b), undefined, {
          sensitivity: "base",
        }),
      ),
    [members],
  );

  const ctx: PoolMemberIdentityContextValue = {
    membersByUserId,
    currentUserId,
    openMember,
    openParticipants,
    getStageName,
  };

  return (
    <PoolMemberIdentityContext.Provider value={ctx}>
      {children}

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-primary/20 sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-full sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
        >
          {selectedMember && (
            <>
              <SheetHeader className="pr-8 text-left">
                <SheetTitle className="font-bebas text-3xl tracking-wide text-primary flex items-center gap-2">
                  <UserCircle2 className="h-7 w-7 shrink-0 opacity-80" />
                  {poolMemberStageName(selectedMember)}
                  {isYou && (
                    <span className="text-sm font-sans font-semibold text-muted-foreground">
                      (you)
                    </span>
                  )}
                </SheetTitle>
                <SheetDescription>
                  Board name above; real name below is what each player adds in Profile (not the
                  display name).
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">
                    Real name
                  </p>
                  <p className="text-base font-medium text-foreground">
                    {selectedRealName ? selectedRealName : "Not added yet"}
                  </p>
                  {isYou && !selectedRealName && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Add it under{" "}
                      <Link href="/profile" className="text-primary underline-offset-2 hover:underline">
                        Profile → Account → Real name
                      </Link>
                      , then reopen this sheet (or refresh the pool).
                    </p>
                  )}
                  {!isYou && !selectedRealName && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      They haven&apos;t added a real name in their profile yet — only they can set
                      it.
                    </p>
                  )}
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="text-muted-foreground/60">Username:</span>{" "}
                    {selectedMember.username}
                  </p>
                  {sheetExtras?.rank != null && (
                    <p>
                      <span className="text-muted-foreground/60">
                        {sheetExtras.rankLabel ?? "Rank"}:
                      </span>{" "}
                      #{sheetExtras.rank}
                    </p>
                  )}
                  {sheetExtras?.subtitle && <p>{sheetExtras.subtitle}</p>}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setProfileOpen(false);
                    setParticipantsOpen(true);
                  }}
                >
                  <Users className="h-4 w-4 mr-2" />
                  See all participants
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-2xl border-primary/20 sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-full sm:w-full sm:max-w-lg sm:rounded-none sm:border-l sm:border-t-0"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="font-bebas text-3xl tracking-wide text-primary">
              Participants
            </SheetTitle>
            <SheetDescription>
              Each person adds their own real name in Profile → Account. Pool names stay on the
              board.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 overflow-hidden rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary/10 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2">Pool name</th>
                  <th className="px-3 py-2">Real name</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m, idx) => {
                  const stage = poolMemberStageName(m);
                  const isRowYou = m.userId === currentUserId;
                  const real = m.realName?.trim();
                  return (
                    <tr
                      key={m.userId}
                      className={cn(
                        idx % 2 === 0 ? "bg-card" : "bg-muted/15",
                        isRowYou && "ring-1 ring-inset ring-primary/30",
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium">
                        <button
                          type="button"
                          className="text-left hover:text-primary underline-offset-2 hover:underline"
                          onClick={() => {
                            setParticipantsOpen(false);
                            openMember(m.userId);
                          }}
                        >
                          {stage}
                          {isRowYou && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {real || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SheetContent>
      </Sheet>
    </PoolMemberIdentityContext.Provider>
  );
}

export function PoolParticipantsTrigger() {
  const ctx = usePoolMemberIdentity();
  if (!ctx) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 shrink-0 gap-1.5 border-border/60 bg-muted/20 px-2.5 text-xs hover:bg-muted/40"
      onClick={() => ctx.openParticipants()}
    >
      <Users className="h-3.5 w-3.5" />
      People
    </Button>
  );
}

export function MemberNameButton({
  userId,
  className,
  children,
  sheetExtras,
  asChildWrapper,
}: {
  userId: number;
  className?: string;
  children?: ReactNode;
  sheetExtras?: MemberSheetExtras;
  asChildWrapper?: boolean;
}) {
  const ctx = usePoolMemberIdentity();
  const label = children ?? ctx?.getStageName(userId) ?? "Player";

  if (!ctx) {
    return <span className={className}>{label}</span>;
  }

  const baseClass = cn(
    "cursor-pointer underline-offset-2 hover:underline focus-visible:underline rounded-sm",
    className,
  );

  if (asChildWrapper) {
    return (
      <button
        type="button"
        className={cn(baseClass, "inline text-left font-inherit")}
        onClick={(e) => {
          e.stopPropagation();
          ctx.openMember(userId, sheetExtras);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={baseClass}
      onClick={(e) => {
        e.stopPropagation();
        ctx.openMember(userId, sheetExtras);
      }}
    >
      {label}
    </button>
  );
}
