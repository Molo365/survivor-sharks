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

export function BottomNav() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user || isHiddenRoute(location)) return null;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden border-t border-border/20 bg-[#060810]/95 backdrop-blur-md">
      <div className="flex items-stretch h-16">
        {TABS.map(({ label, icon: Icon, href }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                active ? "text-primary" : "text-amber-400/70 hover:text-amber-400",
              )}
            >
              <Icon
                className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_rgba(30,144,255,0.6)]")}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
