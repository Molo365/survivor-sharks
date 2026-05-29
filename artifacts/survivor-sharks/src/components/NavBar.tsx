import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User as UserIcon } from "lucide-react";

export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2" data-testid="nav-logo">
          <img src="/logo.png" alt="Survivor Sharks" className="h-10 w-10 object-contain drop-shadow-[0_0_6px_rgba(30,144,255,0.5)]" />
          <span className="font-bebas text-2xl tracking-widest text-primary">SURVIVOR SHARKS</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors" data-testid="nav-dashboard">
                Dashboard
              </Link>
              {user.role === 'admin' && (
                <Link href="/admin" className="text-sm font-medium text-accent hover:text-primary transition-colors" data-testid="nav-admin">
                  Admin
                </Link>
              )}
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
                <span className="text-sm text-muted-foreground hidden sm:inline-block">
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
              <Link href="/register" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" data-testid="nav-register">
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
