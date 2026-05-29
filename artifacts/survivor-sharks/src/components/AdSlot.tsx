import { useMemo } from "react";

export function AdSlot() {
  const isUSCanada = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz.includes("America/");
  }, []);

  if (isUSCanada) {
    return (
      <div 
        className="w-full flex items-center justify-center p-4 rounded-md border border-primary/50 bg-card overflow-hidden relative shadow-[0_0_15px_rgba(30,144,255,0.1)] my-6"
        data-testid="ad-slot-sportsbook"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
        <span className="font-bebas tracking-widest text-xl text-primary/80 z-10">SPORTSBOOK PARTNER</span>
      </div>
    );
  }

  return (
    <div 
      className="w-full flex items-center justify-center p-4 rounded-md border border-border bg-muted/20 my-6"
      data-testid="ad-slot-adsense"
    >
      <span className="text-sm text-muted-foreground uppercase tracking-widest">Advertisement</span>
    </div>
  );
}
