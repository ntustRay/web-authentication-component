import { failure, success } from "../../src/errors.js";
import type { AuthAdapter, AuthSession } from "../../src/types.js";
export interface Simulation {
  delay: number;
  response: "success" | "credentials" | "rate-limit" | "offline";
}
/** An in-memory simulator only. Never use this adapter as a real identity service. */
export function demoAdapter(settings: () => Simulation): AuthAdapter {
  let session: AuthSession | null = null;
  const listeners = new Set<() => void>();
  async function wait() {
    await new Promise((resolve) => setTimeout(resolve, settings().delay));
  }
  function error() {
    const mode = settings().response;
    return mode === "credentials"
      ? failure("invalid-credentials")
      : mode === "rate-limit"
        ? failure("rate-limited", 10)
        : mode === "offline"
          ? failure("unavailable")
          : null;
  }
  function identity(email: string) {
    return {
      user: { id: "demo-member", email, name: "MingRay", emailVerified: true },
      expiresAt: null,
    };
  }
  return {
    id: "demo-only",
    capabilities: {
      password: true,
      registration: true,
      recovery: "code",
      verification: "code",
      providers: ["github", "google", "company-sso"],
    },
    async getSession() {
      return success(session);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async signIn(input) {
      await wait();
      const failed = error();
      if (failed) return failed;
      session = identity(input.email);
      return success({ kind: "authenticated", session });
    },
    async signUp() {
      await wait();
      return (
        error() ?? success({ kind: "verification-required", delivery: "code" })
      );
    },
    async signInWithProvider() {
      await wait();
      const failed = error();
      if (failed) return failed;
      session = identity("mingray@example.com");
      for (const listener of listeners) listener();
      return success({ kind: "authenticated", session });
    },
    async requestPasswordReset() {
      await wait();
      return error() ?? success({ kind: "sent", delivery: "code" });
    },
    async resendVerification() {
      await wait();
      return error() ?? success({ kind: "sent", delivery: "code" });
    },
    async verifyEmail(input) {
      await wait();
      if (input.code !== "123456") return failure("expired");
      session = identity(input.email);
      return success({ kind: "authenticated", session });
    },
    async resetPassword(input) {
      await wait();
      if (input.code !== "123456") return failure("expired");
      session = null;
      return success({ kind: "complete" });
    },
    async signOut() {
      await wait();
      session = null;
      return success({ kind: "complete" });
    },
  };
}
