import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: typeof usersTable.$inferSelect;
    }
  }
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      try {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub)).limit(1);
        if (user) req.user = user;
      } catch {
        // token valid but user not found
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
