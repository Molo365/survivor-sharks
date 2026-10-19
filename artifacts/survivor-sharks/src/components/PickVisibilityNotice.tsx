import { Eye } from "lucide-react";
import {
  NFL_OFFICE_GRID_VISIBILITY_NOTICE,
  NFL_OFFICE_SURVIVOR_VISIBILITY_NOTICE,
} from "@/lib/nflOfficePoolCopy";

type PickVisibilityNoticeProps = {
  kind: "survivor" | "pickem-season" | "nfl-office-grid";
};

const NOTICE_COPY = {
  survivor: NFL_OFFICE_SURVIVOR_VISIBILITY_NOTICE,
  "pickem-season": NFL_OFFICE_GRID_VISIBILITY_NOTICE,
  "nfl-office-grid": NFL_OFFICE_GRID_VISIBILITY_NOTICE,
} as const;

export function PickVisibilityNotice({ kind }: PickVisibilityNoticeProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 mb-4">
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
