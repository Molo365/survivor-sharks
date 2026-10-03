import { Router } from "express";
import { db, sportPoolStatusTable } from "@workspace/db";
import { GetSportPoolStatusResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({
    sport: sportPoolStatusTable.sport,
    status: sportPoolStatusTable.status,
  }).from(sportPoolStatusTable);
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSportPoolStatusResponse.parse(
    Object.fromEntries(rows.map(({ sport, status }) => [sport, status])),
  ));
});

export default router;