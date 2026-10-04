import { Router, type NextFunction, type Request, type Response } from "express";
import { db, sportPoolStatusTable } from "@workspace/db";
import { GetSportPoolStatusResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { requireAdminAuth, verifyAdminToken } from "../middlewares/adminAuth";

const router = Router();
const VALID_STATUSES = ["open", "coming_soon", "paused", "season_over"] as const;

function requireSportStatusReadAccess(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ") && verifyAdminToken(authorization.slice(7))) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

router.get("/", requireSportStatusReadAccess, async (_req, res): Promise<void> => {
  const rows = await db.select({
    sport: sportPoolStatusTable.sport,
    status: sportPoolStatusTable.status,
  }).from(sportPoolStatusTable);
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSportPoolStatusResponse.parse(
    Object.fromEntries(rows.map(({ sport, status }) => [sport, status])),
  ));
});

router.patch("/:sport", requireAdminAuth, async (req, res): Promise<void> => {
  const rawSport = req.params.sport;
  const sport = Array.isArray(rawSport) ? rawSport[0] : rawSport;
  const status: unknown = req.body?.status;
  if (!sport) {
    res.status(400).json({ error: "sport is required" });
    return;
  }
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    res.status(400).json({ error: "status must be open, coming_soon, paused, or season_over" });
    return;
  }

  const updatedAt = new Date();
  const [updated] = await db.insert(sportPoolStatusTable)
    .values({ sport, status: status as typeof VALID_STATUSES[number], updatedAt })
    .onConflictDoUpdate({
      target: sportPoolStatusTable.sport,
      set: { status: status as typeof VALID_STATUSES[number], updatedAt },
    })
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Failed to save sport pool status" });
    return;
  }
  res.json(updated);
});

export default router;
