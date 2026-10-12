import { Radio } from "lucide-react";

type PoolLivePlaceholderProps = {
  /** Matches the Grid tab label in this pool (e.g. Weekly Grid, Daily Grid). */
  gridTabLabel: string;
  /** Optional lead sentence; defaults to a generic live scoreboard message. */
  lead?: string;
};

export function PoolLivePlaceholder({ gridTabLabel, lead }: PoolLivePlaceholderProps) {
  const description =
    lead ??
    "A dedicated live scoreboard — scores, points, and standings in one place — is on the way.";

  return (
    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.04] px-6 py-14 text-center max-w-lg mx-auto">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 mb-4">
        <Radio className="w-6 h-6 text-green-400" aria-hidden />
      </div>
      <h3 className="font-bebas text-2xl tracking-wide text-foreground">Live scoreboard</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
        {description}
        Use <span className="text-foreground/90 font-medium">{gridTabLabel}</span> for this
        period&apos;s pick sheet until then.
      </p>
      <p className="text-xs text-muted-foreground/50 mt-4">
        PDF export will return here once the layout is redesigned.
      </p>
    </div>
  );
}
