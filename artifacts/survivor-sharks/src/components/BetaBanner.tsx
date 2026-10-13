import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "survivor_sharks_beta_banner_dismissed_until";
const DISMISS_DAYS = 7;
const DEFAULT_MESSAGE =
  "Beta — Survivor Sharks is free while we improve the experience. Features may change; bugs can happen. Not a sportsbook — commissioners handle money off-platform.";

type AppConfig = {
  poolCreationOpen: boolean;
  betaBannerEnabled: boolean;
  betaBannerMessage: string | null;
};

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function dismissForWeek() {
  const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(DISMISS_KEY, String(until));
}

export function BetaBanner({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState(isDismissed);

  const { data: config } = useQuery({
    queryKey: ["app-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) return { poolCreationOpen: false, betaBannerEnabled: false, betaBannerMessage: null };
      return res.json() as Promise<AppConfig>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const visible = Boolean(config?.betaBannerEnabled) && !dismissed;
  const message = config?.betaBannerMessage?.trim() || DEFAULT_MESSAGE;

  useEffect(() => {
    document.documentElement.style.setProperty("--beta-banner-offset", visible ? "2.5rem" : "0px");
    return () => {
      document.documentElement.style.removeProperty("--beta-banner-offset");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed top-0 left-0 right-0 z-[70] flex items-start gap-2 border-b border-amber-500/30 bg-amber-950/95 px-3 py-2 text-amber-50 shadow-md backdrop-blur-sm",
        className,
      )}
      data-testid="beta-banner"
    >
      <p className="flex-1 text-[11px] leading-snug sm:text-xs sm:leading-relaxed">
        <span className="font-bold uppercase tracking-wide text-amber-200/90">Beta · </span>
        {message}{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-white">
          Terms
        </Link>
        {" · "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-white">
          Privacy
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss beta banner for 7 days"
        className="shrink-0 rounded p-1 text-amber-200/80 hover:bg-amber-900/60 hover:text-white"
        onClick={() => {
          dismissForWeek();
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
