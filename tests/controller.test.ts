import { describe, expect, it, vi } from "vitest";
import { githubOnly, passwordOnly, safeRedirectPath } from "../src/config.js";
import { createAuthController } from "../src/controller.js";
import { failure, normalizeError, success } from "../src/errors.js";
import type { AuthOutcome, AuthResult, AuthSession } from "../src/types.js";
import { adapter, deferred, password, session } from "./helpers.js";

describe("method boundaries and inputs", () => {
  it("rejects unsupported configuration", () => {
    expect(() =>
      createAuthController({
        adapter: adapter({
          capabilities: { ...adapter().capabilities, password: false },
        }),
        methods: passwordOnly,
      }),
    ).toThrow("password");
  });
  it("GitHub-only rejects password and other-provider calls", async () => {
    const signIn = vi.fn();
    const provider = vi.fn();
    const auth = createAuthController({
      adapter: adapter({ signIn, signInWithProvider: provider }),
      methods: githubOnly,
    });
    expect((await auth.signIn({ email: "ray@example.com", password })).ok).toBe(
      false,
    );
    expect((await auth.signInWithProvider("google")).ok).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
  it("normalizes email but preserves existing short passwords", async () => {
    const signIn = vi.fn(async () =>
      success<AuthOutcome>({ kind: "authenticated", session }),
    );
    const auth = createAuthController({
      adapter: adapter({ signIn }),
      methods: passwordOnly,
    });
    expect(
      (await auth.signIn({ email: " RAY@Example.com ", password: " x " })).ok,
    ).toBe(true);
    expect(signIn).toHaveBeenCalledWith({
      email: "ray@example.com",
      password: " x ",
    });
  });
  it("validates new password and confirmation before calling backend", async () => {
    const signUp = vi.fn();
    const auth = createAuthController({
      adapter: adapter({ signUp }),
      methods: passwordOnly,
    });
    await auth.signUp(
      { email: "ray@example.com", password: "short", name: "" },
      "short",
    );
    await auth.signUp(
      { email: "ray@example.com", password, name: "" },
      "wrong",
    );
    expect(signUp).not.toHaveBeenCalled();
  });
  it("rejects unverified identities", async () => {
    const auth = createAuthController({
      adapter: adapter({
        signIn: async () =>
          success({
            kind: "authenticated",
            session: {
              ...session,
              user: { ...session.user, emailVerified: false },
            },
          }),
      }),
      methods: passwordOnly,
    });
    expect(await auth.signIn({ email: "ray@example.com", password })).toEqual(
      failure("verification-required"),
    );
    expect(auth.getSnapshot().session).toBeNull();
  });
  it("keeps credentials and backend error text out of state and telemetry", async () => {
    const events: unknown[] = [];
    const auth = createAuthController({
      adapter: adapter({
        signIn: async () => {
          throw new Error(`secret ${password}`);
        },
      }),
      methods: passwordOnly,
      onEvent: (event) => events.push(event),
    });
    await auth.signIn({ email: "ray@example.com", password });
    expect(JSON.stringify([auth.getSnapshot(), events])).not.toContain(
      password,
    );
    expect(JSON.stringify(events)).not.toContain("ray@example.com");
  });
});
describe("async session safety", () => {
  it("defers identity rechecks past the SDK callback and coalesces events", async () => {
    vi.useFakeTimers();
    try {
      let changed = () => {};
      const getSession = vi.fn(async () => success<AuthSession | null>(null));
      const auth = createAuthController({
        adapter: adapter({
          getSession,
          subscribe: (listener) => {
            changed = listener;
            return () => {};
          },
        }),
        methods: passwordOnly,
      });
      const stop = auth.start();
      await Promise.resolve();
      const before = getSession.mock.calls.length;
      changed();
      changed();
      await Promise.resolve();
      expect(getSession).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(getSession).toHaveBeenCalledTimes(before + 1);
      changed();
      stop();
      await vi.advanceTimersByTimeAsync(1);
      expect(getSession).toHaveBeenCalledTimes(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("never prevents sign-out because of an earlier rate-limit", async () => {
    const signOut = vi.fn(async () =>
      success<AuthOutcome>({ kind: "complete" }),
    );
    const auth = createAuthController({
      adapter: adapter({
        requestPasswordReset: async () => failure("rate-limited", 60),
        signOut,
      }),
      methods: passwordOnly,
    });
    await auth.signIn({ email: "ray@example.com", password });
    await auth.requestPasswordReset("ray@example.com");
    expect((await auth.signOut()).ok).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(auth.getSnapshot().session).toBeNull();
  });
  it("blocks same-tick double submissions", async () => {
    const pending = deferred<AuthResult<AuthOutcome>>();
    const signIn = vi.fn(() => pending.promise);
    const auth = createAuthController({
      adapter: adapter({ signIn }),
      methods: passwordOnly,
    });
    const first = auth.signIn({ email: "ray@example.com", password });
    expect((await auth.signIn({ email: "ray@example.com", password })).ok).toBe(
      false,
    );
    pending.resolve(success({ kind: "authenticated", session }));
    await first;
    expect(signIn).toHaveBeenCalledTimes(1);
  });
  it("does not let stale refresh resurrect a signed-out account", async () => {
    const read = deferred<AuthResult<AuthSession | null>>();
    const auth = createAuthController({
      adapter: adapter({ getSession: () => read.promise }),
      methods: passwordOnly,
    });
    const refresh = auth.refresh();
    await auth.signOut();
    read.resolve(success(session));
    await refresh;
    expect(auth.getSnapshot().status).toBe("anonymous");
    expect(auth.getSnapshot().session).toBeNull();
  });
  it("invalidates in-flight sign-in after an external identity change", async () => {
    let changed = () => {};
    const signing = deferred<AuthResult<AuthOutcome>>();
    const auth = createAuthController({
      adapter: adapter({
        subscribe: (listener) => {
          changed = listener;
          return () => {};
        },
        signIn: () => signing.promise,
      }),
      methods: passwordOnly,
    });
    const stop = auth.start();
    await auth.refresh();
    const first = auth.signIn({ email: "ray@example.com", password });
    changed();
    await Promise.resolve();
    signing.resolve(success({ kind: "authenticated", session }));
    await first;
    expect(auth.getSnapshot().session).toBeNull();
    stop();
  });
  it("hides private presentation when sign-out fails", async () => {
    const auth = createAuthController({
      adapter: adapter({ signOut: async () => failure("unavailable") }),
      methods: passwordOnly,
    });
    await auth.signIn({ email: "ray@example.com", password });
    await auth.signOut();
    expect(auth.getSnapshot().status).toBe("unavailable");
    expect(auth.getSnapshot().session).toBeNull();
  });
  it("times out and discards late success", async () => {
    vi.useFakeTimers();
    try {
      const signing = deferred<AuthResult<AuthOutcome>>();
      const auth = createAuthController({
        adapter: adapter({ signIn: () => signing.promise }),
        methods: passwordOnly,
        timeoutMs: 100,
      });
      const pending = auth.signIn({ email: "ray@example.com", password });
      await vi.advanceTimersByTimeAsync(101);
      expect(await pending).toEqual(failure("timeout"));
      signing.resolve(success({ kind: "authenticated", session }));
      await Promise.resolve();
      expect(auth.getSnapshot().session).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not resend during cooldown", async () => {
    const send = vi.fn(async () =>
      success<AuthOutcome>({ kind: "sent", delivery: "code" }),
    );
    const auth = createAuthController({
      adapter: adapter({ requestPasswordReset: send }),
      methods: passwordOnly,
    });
    await auth.requestPasswordReset("ray@example.com");
    expect((await auth.requestPasswordReset("ray@example.com")).ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("recovers cancelled OAuth popups", async () => {
    const auth = createAuthController({
      adapter: adapter(),
      methods: githubOnly,
    });
    await auth.signInWithProvider("github");
    expect(auth.getSnapshot().operation.phase).toBe("redirecting");
    await auth.cancelRedirect();
    expect(auth.getSnapshot().operation.phase).toBe("idle");
    expect(auth.getSnapshot().status).toBe("anonymous");
  });
  it("keeps SSR snapshots stable and cleans up final subscription", () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const auth = createAuthController({
      adapter: adapter({ subscribe }),
      methods: passwordOnly,
    });
    expect(auth.getServerSnapshot()).toBe(auth.getServerSnapshot());
    const a = auth.start();
    const b = auth.start();
    a();
    expect(unsubscribe).not.toHaveBeenCalled();
    b();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
describe("safe messages and redirects", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2fevil.example",
    "/%252fevil.example",
    "/%09/evil.example",
  ])("rejects %s", (value) =>
    expect(safeRedirectPath(value, "/account")).toBe("/account"),
  );
  it("keeps local query and fragment", () =>
    expect(safeRedirectPath("/account?tab=profile#details")).toBe(
      "/account?tab=profile#details",
    ));
  it("redacts raw errors", () =>
    expect(
      normalizeError({ message: "email exists: ray@example.com" }),
    ).toEqual({ code: "unknown", retryAfterSeconds: null }));
});
