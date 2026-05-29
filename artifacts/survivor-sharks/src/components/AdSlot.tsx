import { useMemo } from "react";

export function AdSlot() {
  const isUSCanada = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz.includes("America/");
  }, []);

  if (isUSCanada) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-xl my-6"
        data-testid="ad-slot-sportsbook"
        style={{
          background: "linear-gradient(135deg, #060d1f 0%, #0a1428 50%, #060d1f 100%)",
          boxShadow: "0 0 0 1px rgba(30,144,255,0.25), 0 0 40px rgba(30,144,255,0.08), inset 0 1px 0 rgba(30,144,255,0.12)",
        }}
      >
        {/* Animated glow border */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(30,144,255,0.15), transparent)",
            animation: "shimmer 3s ease-in-out infinite",
          }}
        />

        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/60 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary/60 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary/60 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary/60 rounded-br-xl" />

        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 px-8 py-5">
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(30,144,255,0.3), rgba(30,144,255,0.1))",
                border: "1px solid rgba(30,144,255,0.4)",
                boxShadow: "0 0 12px rgba(30,144,255,0.3)",
              }}
            >
              <span className="text-primary text-lg font-black">$</span>
            </div>
            <div>
              <div className="font-bebas text-lg tracking-widest text-white/90 leading-none">SPORTSBOOK PARTNER</div>
              <div className="text-[11px] tracking-[0.15em] text-muted-foreground/60 uppercase mt-0.5">Exclusive offer for Survivor Sharks members</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase"
              style={{
                background: "rgba(57,255,20,0.12)",
                border: "1px solid rgba(57,255,20,0.35)",
                color: "#39ff14",
                boxShadow: "0 0 8px rgba(57,255,20,0.2)",
              }}
            >
              21+ Only
            </span>
            <button
              className="font-bebas tracking-widest text-sm px-5 py-2 rounded-md transition-all duration-200 hover:scale-[1.03]"
              style={{
                background: "linear-gradient(135deg, hsl(211,100%,48%), hsl(211,100%,36%))",
                boxShadow: "0 0 18px rgba(30,144,255,0.4), 0 2px 8px rgba(0,0,0,0.4)",
                color: "white",
              }}
            >
              CLAIM OFFER
            </button>
          </div>
        </div>

        <style>{`
          @keyframes shimmer {
            0%, 100% { opacity: 0; transform: translateX(-100%); }
            50% { opacity: 1; transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl my-6"
      data-testid="ad-slot-adsense"
      style={{
        background: "linear-gradient(135deg, #0d0d0d, #111111)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-center py-5 px-4">
        <span className="text-[11px] tracking-[0.25em] text-muted-foreground/40 uppercase">Advertisement</span>
      </div>
    </div>
  );
}
