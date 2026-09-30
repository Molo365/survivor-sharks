import { cn } from "@/lib/utils";

type Bases = {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
};

export function BaseballLiveState({
  detail,
  bases,
  outs,
}: {
  detail?: string | null;
  bases?: Bases | null;
  outs?: number | null;
}) {
  return (
    <>
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/50 animate-pulse leading-none whitespace-nowrap">
        ● LIVE
      </span>
      {detail && (
        <span className="font-bebas text-[11px] text-red-300/80 leading-none tracking-wide whitespace-nowrap">
          {detail}
        </span>
      )}
      {bases && (
        <div className="flex flex-col items-center gap-0.5 mt-0.5">
          <BaseDiamond onFirst={bases.onFirst} onSecond={bases.onSecond} onThird={bases.onThird} />
          {outs != null && <OutDots outs={outs} />}
        </div>
      )}
    </>
  );
}

function BaseDiamond({
  onFirst,
  onSecond,
  onThird,
  size = 26,
}: {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  size?: number;
}) {
  const c = size / 2;
  const d = size * 0.38;
  const r = size * 0.12;
  const top = { x: c, y: c - d };
  const right = { x: c + d, y: c };
  const bottom = { x: c, y: c + d };
  const left = { x: c - d, y: c };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon
        points={`${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.8"
      />
      <circle cx={bottom.x} cy={bottom.y} r={r * 0.65} fill="rgba(255,255,255,0.12)" />
      <circle
        cx={left.x} cy={left.y} r={r}
        fill={onThird ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onThird ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
      <circle
        cx={top.x} cy={top.y} r={r}
        fill={onSecond ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onSecond ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
      <circle
        cx={right.x} cy={right.y} r={r}
        fill={onFirst ? "rgb(251,191,36)" : "rgba(255,255,255,0.1)"}
        stroke={onFirst ? "rgb(217,119,6)" : "rgba(255,255,255,0.22)"}
        strokeWidth="0.6"
      />
    </svg>
  );
}

function OutDots({ outs }: { outs: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full border",
            i < outs ? "bg-red-400 border-red-500" : "bg-transparent border-white/25",
          )}
        />
      ))}
    </div>
  );
}