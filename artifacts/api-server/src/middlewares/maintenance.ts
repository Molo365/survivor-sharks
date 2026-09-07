import { type NextFunction, type Request, type Response } from "express";
import { getMaintenanceState } from "../lib/maintenance";

const ALWAYS_ALLOWED_EXACT = new Set([
  "/api/healthz",
  "/api/maintenance-status",
  "/api/auth/login",
  "/api/auth/me",
]);

const ALWAYS_ALLOWED_PREFIXES = [
  "/api/admin-auth/",
  "/api/admin-panel/",
];

export async function maintenanceGuard(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  if (
    req.method === "OPTIONS"
    || ALWAYS_ALLOWED_EXACT.has(req.path)
    || ALWAYS_ALLOWED_PREFIXES.some((prefix) => req.path.startsWith(prefix))
  ) {
    next();
    return;
  }

  const state = await getMaintenanceState();
  if (!state.enabled || req.user?.role === "admin") {
    next();
    return;
  }

  res.status(503).json({
    error: "Site down for maintenance",
    code: "MAINTENANCE_MODE",
    message: state.message,
  });
}