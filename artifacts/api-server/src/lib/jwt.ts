import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET ?? "survivor-sharks-jwt-secret-change-in-prod";
const EXPIRES_IN = "8h";

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as unknown as JwtPayload;
    if (typeof decoded.sub === "number" && typeof decoded.username === "string") {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}
