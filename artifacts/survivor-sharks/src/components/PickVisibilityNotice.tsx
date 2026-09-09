import { Eye } from "lucide-react";

type PickVisibilityNoticeProps = {
  kind: "survivor" | "pickem-season";
};

const NOTICE_COPY = {
  survivor:
    "To keep things fair and square, picks stay hidden until each player's selected game kicks off.",
  "pickem-season":
    "Picks reveal game by game as each kickoff passes. Haven't finished this week's picks yet? Yours stay hidden until the first game starts.",
} as const;

export function PickVisibilityNotice({ kind }: PickVisibilityNoticeProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5">
      <div className="rounded-full bg-amber-500/10 p-2 shrink-0">
        <Eye className="h-4 w-4 text-amber-400" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug text-foreground">
          Pick visibility
        </p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
          {NOTICE_COPY[kind]}
        </p>
      </div>
    </div>
  );
}