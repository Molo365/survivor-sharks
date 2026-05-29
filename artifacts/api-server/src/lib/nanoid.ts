import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function nanoid(size = 21): string {
  const bytes = randomBytes(size);
  return Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join("");
}
