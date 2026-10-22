import { useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type SiteMaintenanceStatus = {
  enabled: boolean;
  message: string | null;
  canBypass: boolean;
};

export function useSiteMaintenance(pollMs = 20_000): SiteMaintenanceStatus | null {
  const [status, setStatus] = useState<SiteMaintenanceStatus | null>(null);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    const response = await fetch(`${API_BASE}/api/maintenance-status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(String(response.status));
    setStatus(await response.json() as SiteMaintenanceStatus);
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => refresh().catch(() => {
      if (active) setStatus((c) => c ?? { enabled: false, message: null, canBypass: false });
    });
    run();
    const id = window.setInterval(run, pollMs);
    const onMaintenanceEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean; message: string | null }>).detail;
      setStatus((current) => ({
        enabled: detail.enabled,
        message: detail.message,
        canBypass: current?.canBypass ?? false,
      }));
    };
    window.addEventListener("survivor-sharks:maintenance", onMaintenanceEvent);
    return () => {
      active = false;
      window.clearInterval(id);
      window.removeEventListener("survivor-sharks:maintenance", onMaintenanceEvent);
    };
  }, [refresh, pollMs]);

  return status;
}
