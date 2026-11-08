import { describe, expect, it, vi } from "vitest";
import { passwordOnly } from "../src/config.js";
import { createAuthController } from "../src/controller.js";
import { failure, success } from "../src/errors.js";
import type {
  AuthEvent,
  AuthOutcome,
  AuthResult,
  AuthSession,
} from "../src/types.js";
import { adapter, deferred, password, session } from "./helpers.js";

describe("review regressions: real SDK ordering", () => {
  it("protects the current account after sequential failed sign-outs of different identities", async () => {
    let server = session;
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(server),
        signOut: async () => failure("unavailable"),
      }),
    });
    await auth.refresh();
    await auth.signOut();
    server = { ...session, user: { ...session.user, id: "member-2" } };
    await auth.refresh({ background: true });
    expect(auth.getSnapshot().session?.user.id).toBe("member-2");
    const seen: (string | null)[] = [];
    const unsubscribe = auth.subscribe(() =>
      seen.push(auth.getSnapshot().session?.user.id ?? null),
    );
    await auth.signOut();
    await auth.refresh({ background: true });
    expect(auth.getSnapshot().status).toBe("unavailable");
    expect(seen.every((id) => id === null)).toBe(true);
    unsubscribe();
  });
  it("never exposes the old identity during or after a failed sign-out background read", async () => {
    vi.useFakeTimers();
    try {
      let notify = () => {};
      const gate = deferred<AuthResult<AuthOutcome>>();
      const auth = createAuthController({
        methods: passwordOnly,
        adapter: adapter({
          getSession: async () => success(session),
          signOut: () => gate.promise,
          subscribe: (listener) => {
            notify = listener;
            return () => {};
          },
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      const seen: (string | null)[] = [];
      const unsubscribe = auth.subscribe(() =>
        seen.push(auth.getSnapshot().session?.user.id ?? null),
      );
      const ending = auth.signOut();
      await auth.refresh({ background: true });
      notify();
      gate.resolve(failure("unavailable"));
      await ending;
      await vi.advanceTimersByTimeAsync(1);
      await auth.refresh({ background: true });
      notify();
      await vi.advanceTimersByTimeAsync(1);
      expect(auth.getSnapshot().status).toBe("unavailable");
      expect(seen.every((id) => id === null)).toBe(true);
      await auth.refresh();
      expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
      unsubscribe();
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps a timed-out failed sign-out hidden across background reads and remount", async () => {
    vi.useFakeTimers();
    try {
      const gate = deferred<AuthResult<AuthOutcome>>();
      const auth = createAuthController({
        methods: passwordOnly,
        timeoutMs: 100,
        adapter: adapter({
          getSession: async () => success(session),
          signOut: () => gate.promise,
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      const ending = auth.signOut();
      await vi.advanceTimersByTimeAsync(101);
      expect(await ending).toEqual(failure("timeout"));
      gate.resolve(failure("unavailable"));
      await vi.advanceTimersByTimeAsync(1);
      stop();
      const stopAgain = auth.start();
      await auth.refresh({ background: true });
      expect(auth.getSnapshot().session).toBeNull();
      expect(auth.getSnapshot().status).toBe("unavailable");
      const signing = await auth.signIn({ email: "ray@example.com", password });
      expect(signing.ok).toBe(true);
      expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
      stopAgain();
    } finally {
      vi.useRealTimers();
    }
  });
  it("hides every background identity when queued sign-out began before identity was known", async () => {
    vi.useFakeTimers();
    try {
      let server: AuthSession | null = null;
      const gate = deferred<void>();
      const auth = createAuthController({
        methods: passwordOnly,
        adapter: adapter({
          getSession: async () => success(server),
          signIn: async () => {
            await gate.promise;
            server = session;
            return success({ kind: "authenticated", session });
          },
          signOut: async () => failure("unavailable"),
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      const signing = auth.signIn({ email: "ray@example.com", password });
      const ending = auth.signOut();
      gate.resolve();
      await Promise.all([signing, ending]);
      await auth.refresh({ background: true });
      expect(auth.getSnapshot().session).toBeNull();
      expect(auth.getSnapshot().status).toBe("unavailable");
      await auth.refresh();
      expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("accepts a sign-out which eventually succeeds after timeout", async () => {
    vi.useFakeTimers();
    try {
      let server: AuthSession | null = session;
      const gate = deferred<void>();
      const auth = createAuthController({
        methods: passwordOnly,
        timeoutMs: 100,
        adapter: adapter({
          getSession: async () => success(server),
          signOut: async () => {
            await gate.promise;
            server = null;
            return success({ kind: "complete" });
          },
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      const ending = auth.signOut();
      await vi.advanceTimersByTimeAsync(101);
      expect(await ending).toEqual(failure("timeout"));
      gate.resolve();
      await vi.advanceTimersByTimeAsync(1);
      expect(auth.getSnapshot().status).toBe("anonymous");
      expect(auth.getSnapshot().session).toBeNull();
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("preserves a verified different identity even when an older sign-out fails", async () => {
    let server = session;
    let notify = () => {};
    const gate = deferred<AuthResult<AuthOutcome>>();
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(server),
        signOut: () => gate.promise,
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
      }),
    });
    const stop = auth.start();
    await auth.refresh();
    const ending = auth.signOut();
    server = { ...session, user: { ...session.user, id: "member-2" } };
    notify();
    gate.resolve(failure("unavailable"));
    expect(await ending).toEqual(failure("cancelled"));
    expect(auth.getSnapshot().session?.user.id).toBe("member-2");
    stop();
  });
  it.each(["sign-up", "verify"])(
    "revalidates the current account after %s completes without replacing its session",
    async (action) => {
      vi.useFakeTimers();
      try {
        const auth = createAuthController({
          methods: passwordOnly,
          adapter: adapter({
            getSession: async () => success(session),
            signUp: async () =>
              success({ kind: "verification-required", delivery: "code" }),
            verifyEmail: async () => success({ kind: "complete" }),
          }),
        });
        const stop = auth.start();
        await auth.refresh();
        const result =
          action === "sign-up"
            ? await auth.signUp(
                { email: "other@example.com", name: "Other", password },
                password,
              )
            : await auth.verifyEmail({
                email: "other@example.com",
                code: "123456",
              });
        await vi.advanceTimersByTimeAsync(1);
        expect(result.ok).toBe(true);
        expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
        expect(auth.getSnapshot().operation.outcome).toBe(
          action === "sign-up" ? "verification-required" : "complete",
        );
        stop();
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("accepts a background proof that the failed sign-out session no longer exists", async () => {
    let server: AuthSession | null = session;
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(server),
        signOut: async () => failure("unavailable"),
      }),
    });
    await auth.refresh();
    await auth.signOut();
    server = null;
    await auth.refresh({ background: true });
    expect(auth.getSnapshot().status).toBe("anonymous");
  });
  it("still executes an explicitly queued sign-out after unmount and remount", async () => {
    vi.useFakeTimers();
    try {
      let server: AuthSession | null = null;
      const gate = deferred<void>();
      const signOut = vi.fn(async () => {
        server = null;
        return success<AuthOutcome>({ kind: "complete" });
      });
      const auth = createAuthController({
        methods: passwordOnly,
        adapter: adapter({
          getSession: async () => success(server),
          signOut,
          signIn: async () => {
            await gate.promise;
            server = session;
            return success({ kind: "authenticated", session });
          },
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      const signing = auth.signIn({ email: "ray@example.com", password });
      const ending = auth.signOut();
      stop();
      const stopAgain = auth.start();
      expect(await signing).toEqual(failure("cancelled"));
      expect(await ending).toEqual(failure("cancelled"));
      gate.resolve();
      await gate.promise;
      await vi.advanceTimersByTimeAsync(1);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(server).toBeNull();
      expect(auth.getSnapshot().session).toBeNull();
      stopAgain();
    } finally {
      vi.useRealTimers();
    }
  });
  it("rechecks an initial session read invalidated by a non-identity mutation", async () => {
    vi.useFakeTimers();
    try {
      const initialRead = deferred<AuthResult<AuthSession | null>>();
      let reads = 0;
      const auth = createAuthController({
        methods: passwordOnly,
        adapter: adapter({
          getSession: () =>
            ++reads === 1
              ? initialRead.promise
              : Promise.resolve(success(session)),
        }),
      });
      const stop = auth.start();
      await auth.requestPasswordReset("ray@example.com");
      initialRead.resolve(success(session));
      await vi.advanceTimersByTimeAsync(1);
      expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("restores the verified current account after a failed account-switch attempt", async () => {
    vi.useFakeTimers();
    try {
      const auth = createAuthController({
        methods: passwordOnly,
        adapter: adapter({
          getSession: async () => success(session),
          signIn: async () => failure("invalid-credentials"),
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      await auth.signIn({ email: "other@example.com", password });
      await vi.advanceTimersByTimeAsync(1);
      expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
      expect(auth.getSnapshot().operation.error?.code).toBe(
        "invalid-credentials",
      );
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("accepts a normal SDK sign-in notification after verifying the matching identity", async () => {
    let server: AuthSession | null = null;
    let notify = () => {};
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(server),
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
        signIn: async () => {
          server = session;
          notify();
          return success({ kind: "authenticated", session });
        },
      }),
    });
    const stop = auth.start();
    await auth.refresh();
    expect((await auth.signIn({ email: "ray@example.com", password })).ok).toBe(
      true,
    );
    expect(auth.getSnapshot().session?.user.id).toBe(session.user.id);
    stop();
  });
  it("does not let an old sign-out result clear a newly verified account", async () => {
    let server: AuthSession | null = session;
    let notify = () => {};
    const gate = deferred<AuthResult<AuthOutcome>>();
    const other = { ...session, user: { ...session.user, id: "member-2" } };
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(server),
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
        signOut: () => gate.promise,
      }),
    });
    const stop = auth.start();
    await auth.refresh();
    const ending = auth.signOut();
    server = other;
    notify();
    gate.resolve(success({ kind: "complete" }));
    expect(await ending).toEqual(failure("cancelled"));
    expect(auth.getSnapshot().session?.user.id).toBe("member-2");
    stop();
  });
  it("keeps private UI cleared while sign-out is pending despite focus and SDK callbacks", async () => {
    vi.useFakeTimers();
    try {
      let server: AuthSession | null = session;
      let notify = () => {};
      const gate = deferred<void>();
      const getSession = vi.fn(async () => success(server));
      const auth = createAuthController({
        methods: passwordOnly,
        adapter: adapter({
          getSession,
          subscribe: (listener) => {
            notify = listener;
            return () => {};
          },
          signOut: async () => {
            await gate.promise;
            server = null;
            notify();
            return success({ kind: "complete" });
          },
        }),
      });
      const stop = auth.start();
      await auth.refresh();
      const ending = auth.signOut();
      const reads = getSession.mock.calls.length;
      await auth.refresh();
      notify();
      await vi.advanceTimersByTimeAsync(1);
      expect(auth.getSnapshot().session).toBeNull();
      expect(getSession).toHaveBeenCalledTimes(reads);
      gate.resolve();
      await ending;
      expect(auth.getSnapshot().status).toBe("anonymous");
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
  it("serializes sign-out after an already running sign-in instead of rejecting it", async () => {
    let server: AuthSession | null = null;
    const gate = deferred<void>();
    const signOut = vi.fn(async () => {
      server = null;
      return success<AuthOutcome>({ kind: "complete" });
    });
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(server),
        signOut,
        signIn: async () => {
          await gate.promise;
          server = session;
          return success({ kind: "authenticated", session });
        },
      }),
    });
    const signing = auth.signIn({ email: "ray@example.com", password });
    const ending = auth.signOut();
    expect(signOut).not.toHaveBeenCalled();
    gate.resolve();
    expect(await signing).toEqual(failure("cancelled"));
    expect((await ending).ok).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(server).toBeNull();
    expect(auth.getSnapshot().session).toBeNull();
  });
  it("does not release the SDK mutation lock when a request times out", async () => {
    vi.useFakeTimers();
    try {
      let server: AuthSession | null = null;
      const gate = deferred<void>();
      const signIn = vi.fn(async () => {
        await gate.promise;
        server = session;
        return success<AuthOutcome>({ kind: "authenticated", session });
      });
      const signOut = vi.fn(async () => {
        server = null;
        return success<AuthOutcome>({ kind: "complete" });
      });
      const auth = createAuthController({
        methods: passwordOnly,
        timeoutMs: 100,
        adapter: adapter({
          signIn,
          signOut,
          getSession: async () => success(server),
        }),
      });
      const first = auth.signIn({ email: "ray@example.com", password });
      await vi.advanceTimersByTimeAsync(101);
      expect(await first).toEqual(failure("timeout"));
      expect(
        (await auth.signIn({ email: "other@example.com", password })).ok,
      ).toBe(false);
      expect(signIn).toHaveBeenCalledTimes(1);
      const ending = auth.signOut();
      expect(signOut).not.toHaveBeenCalled();
      gate.resolve();
      await ending;
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(server).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not let cancelRedirect cancel an ordinary password mutation", async () => {
    const gate = deferred<AuthResult<AuthOutcome>>();
    const signIn = vi.fn(() => gate.promise);
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({ signIn }),
    });
    const first = auth.signIn({ email: "ray@example.com", password });
    await auth.cancelRedirect();
    expect(auth.getSnapshot().operation.phase).toBe("pending");
    expect((await auth.signIn({ email: "ray@example.com", password })).ok).toBe(
      false,
    );
    expect(signIn).toHaveBeenCalledTimes(1);
    gate.resolve(success({ kind: "authenticated", session }));
    await first;
  });
  it("does not return or emit a stale authenticated success after the server switched accounts", async () => {
    let notify = () => {};
    let server: AuthSession | null = null;
    const gate = deferred<AuthResult<AuthOutcome>>();
    const events: AuthEvent[] = [];
    const other = {
      ...session,
      user: { ...session.user, id: "member-2", email: "other@example.com" },
    };
    const auth = createAuthController({
      methods: passwordOnly,
      onEvent: (event) => events.push(event),
      adapter: adapter({
        getSession: async () => success(server),
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
        signIn: () => gate.promise,
      }),
    });
    const stop = auth.start();
    await auth.refresh();
    const signing = auth.signIn({ email: "ray@example.com", password });
    server = other;
    notify();
    gate.resolve(success({ kind: "authenticated", session }));
    expect(await signing).toEqual(failure("cancelled"));
    expect(events.some((event) => event.type === "succeeded")).toBe(false);
    expect(auth.getSnapshot().session?.user.id).toBe("member-2");
    stop();
  });
});

describe("review regressions: immutable public data", () => {
  it("strips extra secret fields from adapter results and snapshots", async () => {
    const secret = "test-secret-never-public";
    const supplied = {
      ...session,
      access_token: secret,
      user: { ...session.user, refresh_token: secret },
    };
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({
        getSession: async () => success(supplied),
        signIn: async () =>
          success({ kind: "authenticated", session: supplied }),
      }),
    });
    const result = await auth.signIn({ email: "ray@example.com", password });
    const snapshot = auth.getSnapshot();
    expect(JSON.stringify([snapshot, result])).not.toContain(secret);
    supplied.user.id = "changed-after-snapshot";
    expect(snapshot.session?.user.id).toBe("member-1");
    await auth.refresh();
    expect(JSON.stringify(auth.getSnapshot())).not.toContain(secret);
  });
  it("strips raw error fields from custom adapter failures", async () => {
    const raw = {
      code: "invalid-credentials",
      retryAfterSeconds: null,
      message: "private-provider-detail",
    } satisfies import("../src/types.js").AuthError & { message: string };
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter({ signIn: async () => ({ ok: false, error: raw }) }),
    });
    const result = await auth.signIn({ email: "ray@example.com", password });
    expect(JSON.stringify([result, auth.getSnapshot()])).not.toContain(
      "private-provider-detail",
    );
  });
  it("does not expose mutable method or password-policy objects", () => {
    const auth = createAuthController({
      methods: passwordOnly,
      adapter: adapter(),
    });
    expect(() => Object.assign(auth.policy, { minLength: 1 })).toThrow();
    expect(() =>
      Object.assign(auth.methods, { registration: false }),
    ).toThrow();
    expect(() =>
      Object.assign(auth.capabilities.providers, { 0: "attacker-provider" }),
    ).toThrow();
  });
  it("rejects timeout values which overflow a JavaScript timer", () => {
    expect(() =>
      createAuthController({
        methods: passwordOnly,
        adapter: adapter(),
        timeoutMs: 3_000_000_000,
      }),
    ).toThrow();
  });
});
