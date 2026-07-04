import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Home, Target, Trophy, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Home",      icon: Home,   href: "/dashboard" },
  { label: "Picks",     icon: Target, href: "/picks"     },
  { label: "Standings", icon: Trophy, href: "/standings" },
  { label: "Scores",    icon: Tv,     href: "/scores"    },
] as const;

const HIDDEN_PREFIXES = ["/", "/login", "/register", "/reset-password", "/join/", "/admin"];

function isHiddenRoute(path: string): boolean {
  if (path === "/") return true;
  return HIDDEN_PREFIXES.slice(1).some((prefix) => path.startsWith(prefix));
}

export function DesktopSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user || isHiddenRoute(location)) return null;

  return (
    <nav className="hidden md:flex fixed left-0 top-16 h-[calc(100vh-64px)] w-20 z-40 flex-col border-r border-border/40 bg-background/95 backdrop-blur">
      {TABS.map(({ label, icon: Icon, href }) => {
        const active = location === href || location.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 py-4 w-full text-xs font-medium uppercase tracking-[0.12em] transition-colors",
              active ? "text-primary" : "text-amber-400/70 hover:text-amber-400",
            )}
          >
            <Icon
              className={cn("w-6 h-6", active && "drop-shadow-[0_0_6px_rgba(30,144,255,0.6)]")}
              strokeWidth={active ? 2.2 : 1.8}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
