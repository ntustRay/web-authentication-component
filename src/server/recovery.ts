import { createHash, randomBytes } from "node:crypto";
import { AuthFailure } from "../errors.js";

export interface RecoveryRecord {
  digest: string;
  userId: string;
  expiresAt: number;
}
export interface RecoveryStore {
  put(record: RecoveryRecord): Promise<void>;
  /** Atomically consume an unexpired digest ONCE; return its owner or null. Use DELETE…RETURNING or a transaction. */
  consume(digest: string, now: number): Promise<string | null>;
}
export function digestRecoveryToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export async function issueRecoveryToken(
  store: RecoveryStore,
  userId: string,
  ttlSeconds = 900,
): Promise<string> {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 3600 ||
    !userId
  )
    throw new AuthFailure("invalid-input");
  const token = randomBytes(32).toString("base64url");
  await store.put({
    digest: digestRecoveryToken(token),
    userId,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return token;
}
export async function consumeRecoveryToken(
  store: RecoveryStore,
  token: string,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthFailure("expired");
  const owner = await store.consume(digestRecoveryToken(token), Date.now());
  if (!owner) throw new AuthFailure("expired");
  return owner;
}
