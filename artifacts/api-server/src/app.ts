import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { loadUser } from "./middlewares/auth";
import { sessionMiddleware } from "./lib/session";
import router from "./routes";
import adminHtmlRouter from "./routes/admin-html";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(loadUser);

app.use("/api", router);
app.use("/api/admin-html", adminHtmlRouter);

const frontendDist = path.resolve(process.cwd(), "artifacts/survivor-sharks/dist/public");
app.use(express.static(frontendDist));
app.get("*splat", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { status?: number; statusCode?: number })?.statusCode
    ?? 500;
  logger.error({ err, req: { method: req.method, url: req.url } }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(status).json({ error: status < 500 ? (err instanceof Error ? err.message : "Bad request") : "Internal server error" });
  }
});

export default app;
