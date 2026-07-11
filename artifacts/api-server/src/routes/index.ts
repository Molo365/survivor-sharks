import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import poolsRouter from "./pools";
import picksRouter from "./picks";
import scheduleRouter from "./schedule";
import gridRouter from "./grid";
import resultsRouter from "./results";
import eliminationsRouter from "./eliminations";
import leaderboardRouter from "./leaderboard";
import teamsRouter from "./teams";
import adminRouter from "./admin";
import adminAuthRouter from "./adminAuth";
import adminPanelRouter from "./adminPanel";
import agentRouter from "./agent";
import pickemRouter from "./pickem";
import gspRouter from "./gsp";
import ndpRouter from "./ndp";
import dashboardRouter from "./dashboard";
import crazyEightsRouter from "./crazy-eights";
import nflConfidenceRouter from "./nfl-confidence";
import nflConfidenceWeeklyRouter from "./nfl-confidence-weekly";
import pickemSeasonRouter from "./pickem-season";
import bracketRouter from "./bracket";
import scoresRouter from "./scores";
import picksSummaryRouter from "./picks-summary";
import usersRouter from "./users";

const router: IRouter = Router();

// GET /api/config — public feature flags (no auth required)
router.get("/config", (_req, res) => {
  res.json({ poolCreationOpen: process.env.POOL_CREATION_OPEN === "true" });
});

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/pools", poolsRouter);
router.use("/pools/:poolId/picks", picksRouter);
router.use("/pools/:poolId/schedule", scheduleRouter);
router.use("/pools/:poolId/grid", gridRouter);
router.use("/pools/:poolId/results", resultsRouter);
router.use("/pools/:poolId/eliminations", eliminationsRouter);
router.use("/pools/:poolId/leaderboard", leaderboardRouter);
router.use("/pools/:poolId/pickem", pickemRouter);
router.use("/pools/:poolId/gsp", gspRouter);
router.use("/pools/:poolId/ndp", ndpRouter);
router.use("/pools/:poolId/crazy-eights", crazyEightsRouter);
router.use("/pools/:poolId/nfl-confidence", nflConfidenceRouter);
router.use("/pools/:poolId/nfl-confidence-weekly", nflConfidenceWeeklyRouter);
router.use("/pools/:poolId/pickem-season", pickemSeasonRouter);
router.use("/pools/:poolId/bracket", bracketRouter);
router.use("/scores", scoresRouter);
router.use("/picks", picksSummaryRouter);
router.use("/dashboard", dashboardRouter);
router.use("/sports", teamsRouter);
router.use("/admin", adminRouter);
router.use("/admin-auth", adminAuthRouter);
router.use("/admin-panel", adminPanelRouter);
router.use("/agent", agentRouter);
router.use("/users", usersRouter);

export default router;
