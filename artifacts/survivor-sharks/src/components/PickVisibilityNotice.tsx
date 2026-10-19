import { Clock, Eye } from "lucide-react";
import { nflOfficePoolBannerLines, type NflOfficePoolNoticeKind } from "@/lib/nflOfficePoolCopy";

type PickVisibilityNoticeProps = {
  kind: "survivor" | "pickem-season" | "nfl-office-grid";
};

function noticeKind(kind: PickVisibilityNoticeProps["kind"]): NflOfficePoolNoticeKind {
  return kind === "survivor" ? "survivor" : "grid";
}

export function PickVisibilityNotice({ kind }: PickVisibilityNoticeProps) {
  const lines = nflOfficePoolBannerLines(noticeKind(kind));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 mb-4">
      <p className="text-sm font-semibold leading-snug text-foreground">
        {lines.title}
      </p>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-500/10 p-2 shrink-0">
          <Clock className="h-4 w-4 text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">
            Your picks
          </p>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {lines.yourPicks}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-500/10 p-2 shrink-0">
          <Eye className="h-4 w-4 text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">
            Opponents
          </p>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {lines.opponents}
          </p>
        </div>
      </div>
    </div>
  );
}
