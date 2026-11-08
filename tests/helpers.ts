import { success } from "../src/errors.js";
import type { AuthAdapter, AuthSession } from "../src/types.js";
export const session: AuthSession = {
  user: {
    id: "member-1",
    email: "ray@example.com",
    name: "Ray",
    emailVerified: true,
  },
  expiresAt: null,
};
export const password = "quiet ocean lantern orbit";
export function deferred<T>() {
  let finish: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error("Promise not initialized");
      finish(value);
    },
  };
}
export function adapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    id: "test",
    capabilities: {
      password: true,
      registration: true,
      recovery: "code",
      verification: "code",
      providers: ["github", "google", "corporate-sso"],
    },
    getSession: async () => success(null),
    signOut: async () => success({ kind: "complete" }),
    signIn: async () => success({ kind: "authenticated", session }),
    signUp: async () =>
      success({ kind: "verification-required", delivery: "code" }),
    signInWithProvider: async () => success({ kind: "redirecting" }),
    requestPasswordReset: async () =>
      success({ kind: "sent", delivery: "code" }),
    resetPassword: async () => success({ kind: "complete" }),
    resendVerification: async () => success({ kind: "sent", delivery: "code" }),
    verifyEmail: async () => success({ kind: "authenticated", session }),
    ...overrides,
  };
}
