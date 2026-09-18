import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Random URL-safe token with 256 bits of entropy. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function getAppSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("APP_SECRET doit être défini et faire au moins 32 caractères");
  }
  return secret;
}

export function hmacSign(payload: string): string {
  return createHmac("sha256", getAppSecret()).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function hmacVerify(payload: string, signature: string): boolean {
  return safeEqual(hmacSign(payload), signature);
}
