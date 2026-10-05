import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * On mobile, the system Back key follows browser history. Client-side login and
 * redirects can leave [external-site, pool] with no dashboard entry, so Back
 * exits the app. Seed an extra history step and send the first Back to /dashboard.
 */
export function useAndroidPoolBackToDashboard(enabled: boolean) {
  const [, navigate] = useLocation();
  const trapPushedRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 768px)").matches) return;

    if (!trapPushedRef.current) {
      window.history.pushState({ survivorSharksPoolBackTrap: true }, "", window.location.href);
      trapPushedRef.current = true;
    }

    const onPopState = () => {
      navigate("/dashboard", { replace: true });
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      trapPushedRef.current = false;
    };
  }, [enabled, navigate]);
}
