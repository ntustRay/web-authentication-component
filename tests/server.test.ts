// @vitest-environment node
import { describe, expect, it } from "vitest";
import { githubOnly } from "../src/config.js";
import { normalizeError } from "../src/errors.js";
import {
  assertAllowedMethod,
  assertTrustedOrigin,
  enforceRateLimit,
  type RateLimiter,
} from "../src/server/guards.js";
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../src/server/password.js";
import {
  consumeRecoveryToken,
  issueRecoveryToken,
  type RecoveryRecord,
  type RecoveryStore,
} from "../src/server/recovery.js";
import { password } from "./helpers.js";

describe("server protections", () => {
  it("hashes with unique salts and verifies the entire password", async () => {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(`${password} `, first)).toBe(false);
    expect(
      await verifyPassword(password, first.replace("131072", "999999999")),
    ).toBe(false);
    expect(await verifyPassword(password, "malformed")).toBe(false);
  }, 15_000);
  it("fails closed if a configured breach check is unavailable", async () => {
    await expect(
      validateNewPassword(password, {
        isCompromised: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      validateNewPassword(password, { isCompromised: async () => true }),
    ).rejects.toMatchObject({ code: "weak-password" });
  });
  it("rejects foreign/missing origin and disabled server methods", () => {
    expect(() =>
      assertTrustedOrigin(
        new Request("https://app.example/auth", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
        ["https://app.example"],
      ),
    ).toThrow();
    expect(() =>
      assertTrustedOrigin(
        new Request("https://app.example/auth", { method: "POST" }),
        ["https://app.example"],
      ),
    ).toThrow();
    expect(() =>
      assertTrustedOrigin(
        new Request("https://app.example/auth", {
          method: "POST",
          headers: { origin: "https://app.example" },
        }),
        ["https://app.example"],
      ),
    ).not.toThrow();
    expect(() => assertAllowedMethod("password", githubOnly)).toThrow();
    expect(() =>
      assertAllowedMethod({ provider: "github" }, githubOnly),
    ).not.toThrow();
  });
  it("preserves server Retry-After without exposing request inputs", async () => {
    const limiter: RateLimiter = {
      consume: async () => ({ allowed: false, retryAfterSeconds: 42 }),
    };
    try {
      await enforceRateLimit(limiter, "opaque-key");
      throw new Error("expected rejection");
    } catch (error) {
      expect(normalizeError(error)).toEqual({
        code: "rate-limited",
        retryAfterSeconds: 42,
      });
    }
  });
  it("stores only digests and atomically consumes recovery tokens once", async () => {
    const records = new Map<string, RecoveryRecord>();
    const store: RecoveryStore = {
      put: async (record) => {
        records.set(record.digest, record);
      },
      consume: async (digest, now) => {
        const record = records.get(digest);
        records.delete(digest);
        return record && record.expiresAt > now ? record.userId : null;
      },
    };
    const token = await issueRecoveryToken(store, "member-1");
    expect(JSON.stringify([...records.values()])).not.toContain(token);
    const attempts = await Promise.allSettled([
      consumeRecoveryToken(store, token),
      consumeRecoveryToken(store, token),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const expired = await issueRecoveryToken(store, "member-1");
    for (const record of records.values()) record.expiresAt = 0;
    await expect(consumeRecoveryToken(store, expired)).rejects.toMatchObject({
      code: "expired",
    });
  });
});
