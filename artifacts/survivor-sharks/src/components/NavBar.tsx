import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronLeft } from "lucide-react";

const NO_BACK_PATHS = new Set(["/", "/dashboard", "/login", "/register"]);

export function NavBar() {
  const { user, isLoading, logout } = useAuth();
  const [location] = useLocation();

  const showBack = user && !NO_BACK_PATHS.has(location);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/*
        Mobile  (< sm): [auto][1fr][auto]
          – back button takes its natural width
          – wordmark fills the middle, left-aligned with a small indent
            (sits left-of-centre because the right column is wider than the left)
          – username + logout flush right
        Desktop (≥ sm): [1fr][auto][1fr]
          – classic perfectly-centred wordmark, unchanged
      */}
      <div className="container grid grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] h-16 items-center">

        {/* Left: optional Back → Dashboard link, inset from the edge */}
        <div className="flex items-center pl-1 sm:pl-0">
          {showBack && (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              data-testid="nav-back"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
        </div>

        {/* Center: wordmark — left-leaning on mobile, centred on desktop */}
        <Link href="/" className="flex items-center justify-start pl-3 sm:justify-center sm:pl-0" data-testid="nav-logo">
          <span className="font-bebas text-lg tracking-wide text-primary whitespace-nowrap sm:text-2xl sm:tracking-widest">
            SURVIVOR SHARKS
          </span>
        </Link>

        {/* Right: user nav — justify-end keeps it flush right */}
        <div className="flex items-center justify-end gap-4">
          {isLoading ? (
            <div className="h-8 w-32 rounded-md bg-muted/30 animate-pulse" />
          ) : user ? (
            <>
              <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors hidden sm:inline" data-testid="nav-dashboard">
                Dashboard
              </Link>
              {user.role === "admin" && (
                <a
                  href="/admin/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-accent hover:text-primary transition-colors"
                  data-testid="nav-admin"
                >
                  Super Admin
                </a>
              )}
              <div className="flex items-center gap-2 sm:ml-4 sm:pl-4 sm:border-l sm:border-border">
                <span className="text-sm text-muted-foreground truncate max-w-[72px] sm:max-w-[90px]">
                  {user.displayName || user.username}
                </span>
                <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout" title="Log out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors px-4 py-2" data-testid="nav-login">
                Sign In
              </Link>
              <Link
                href="/register"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                data-testid="nav-register"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
