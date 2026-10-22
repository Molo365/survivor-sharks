import { type ReactNode } from "react";
import { Wrench } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteMaintenance } from "@/hooks/useSiteMaintenance";

const DEFAULT_MESSAGE = "We’ll be back soon.";

interface MaintenanceEventDetail {
  enabled: boolean;
  message: string | null;
}

export const MAINTENANCE_EVENT = "survivor-sharks:maintenance";

function normalizeRoutePath(path: string) {
  const withoutQuery = path.split(/[?#]/, 1)[0];
  return withoutQuery.replace(/\/+$/, "") || "/";
}

function isMaintenanceLoginPath(path: string) {
  const normalizedPath = normalizeRoutePath(path);
  return ["/login", "/super-admin"].some(
    (loginPath) =>
      normalizedPath === loginPath || normalizedPath.endsWith(loginPath),
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const status = useSiteMaintenance();
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  const canBypass = status.canBypass || user?.role === "admin";
  const isMaintenanceLogin = status.enabled && isMaintenanceLoginPath(location);

  if (status.enabled && !canBypass && !isMaintenanceLogin) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-6">
        <section className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Wrench className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-bebas text-4xl tracking-wider text-foreground sm:text-5xl">
            Site down for maintenance
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {status.message || DEFAULT_MESSAGE}
          </p>
          {user && user.role !== "admin" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{user.displayName || user.username}</span>.
            </p>
          )}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/super-admin"
              className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-semibold tracking-wide bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Staff sign in
            </Link>
            {user && (
              <button
                type="button"
                onClick={() => logout()}
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  return children;
}