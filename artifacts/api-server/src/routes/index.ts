import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import poolsRouter from "./pools";
import picksRouter from "./picks";
import gridRouter from "./grid";
import resultsRouter from "./results";
import eliminationsRouter from "./eliminations";
import leaderboardRouter from "./leaderboard";
import teamsRouter from "./teams";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/pools", poolsRouter);
router.use("/pools/:poolId/picks", picksRouter);
router.use("/pools/:poolId/grid", gridRouter);
router.use("/pools/:poolId/results", resultsRouter);
router.use("/pools/:poolId/eliminations", eliminationsRouter);
router.use("/pools/:poolId/leaderboard", leaderboardRouter);
router.use("/sports", teamsRouter);
router.use("/admin", adminRouter);

export default router;
