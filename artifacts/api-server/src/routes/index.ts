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
import pickemRouter from "./pickem";

const router: IRouter = Router();

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
router.use("/sports", teamsRouter);
router.use("/admin", adminRouter);
router.use("/admin-auth", adminAuthRouter);
router.use("/admin-panel", adminPanelRouter);

export default router;
