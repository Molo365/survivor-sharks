import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, Wrench } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const POLL_INTERVAL_MS = 20_000;
const DEFAULT_MESSAGE = "We’ll be back soon.";

interface MaintenanceStatus {
  enabled: boolean;
  message: string | null;
  canBypass: boolean;
}

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
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [location] = useLocation();
  const { user } = useAuth();

  const refreshStatus = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    const response = await fetch(`${API_BASE}/api/maintenance-status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Maintenance status request failed: ${response.status}`);
    }
    const nextStatus = await response.json() as MaintenanceStatus;
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () => {
      refreshStatus().catch(() => {
        if (active) setStatus((current) => current ?? { enabled: false, message: null, canBypass: false });
      });
    };
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshStatus]);

  useEffect(() => {
    const handleMaintenance = (event: Event) => {
      const detail = (event as CustomEvent<MaintenanceEventDetail>).detail;
      setStatus((current) => ({
        enabled: detail.enabled,
        message: detail.message,
        canBypass: current?.canBypass ?? false,
      }));
    };
    window.addEventListener(MAINTENANCE_EVENT, handleMaintenance);
    return () => window.removeEventListener(MAINTENANCE_EVENT, handleMaintenance);
  }, []);

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
          <Link
            href="/super-admin"
            data-testid="link-maintenance-admin-login"
            className="mt-8 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-semibold tracking-wide text-primary transition-colors hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Super Admin sign in
          </Link>
        </section>
      </main>
    );
  }

  return children;
}