import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

const ADMIN_JWT_SECRET = (process.env.SESSION_SECRET ?? "survivor-sharks-jwt-secret") + "-admin";
const ADMIN_JWT_EXPIRES = "2h";

export interface AdminJwtPayload {
  sub: "admin";
  iat?: number;
  exp?: number;
}

export function signAdminToken(): string {
  return jwt.sign({ sub: "admin" }, ADMIN_JWT_SECRET, { expiresIn: ADMIN_JWT_EXPIRES });
}

export function verifyAdminToken(token: string): AdminJwtPayload | null {
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as AdminJwtPayload;
    if (decoded.sub === "admin") return decoded;
    return null;
  } catch {
    return null;
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired admin token" });
    return;
  }
  next();
}
