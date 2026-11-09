import { describe, expect, it, vi } from "vitest";
import {
  type BetterAuthClientPort,
  createBetterAuthAdapter,
} from "../src/adapters/better-auth.js";
import { createHostedAdapter } from "../src/adapters/hosted.js";
import { createNeonAdapter } from "../src/adapters/neon.js";
import {
  createSupabaseAdapter,
  type SupabaseAuthPort,
} from "../src/adapters/supabase.js";
import { passwordOnly } from "../src/config.js";
import { createAuthController } from "../src/controller.js";
import { failure, success } from "../src/errors.js";
import { password, session } from "./helpers.js";

const options = {
  providers: [],
  callbackUrl: "https://app.example/callback",
  errorCallbackUrl: "https://app.example/login",
  recoveryUrl: "https://app.example/recovery",
};
function native(): BetterAuthClientPort {
  return {
    getSession: async () => ({
      data: {
        user: {
          id: "member-1",
          email: "ray@example.com",
          emailVerified: false,
        },
        session: { expiresAt: new Date(Date.now() + 60_000) },
      },
    }),
    signOut: async () => ({}),
    signIn: { email: async () => ({}), social: async () => ({}) },
    signUp: { email: async () => ({}) },
    requestPasswordReset: async () => ({}),
    resetPassword: async () => ({}),
    sendVerificationEmail: async () => ({}),
  };
}
describe("review regressions: advertised adapter capabilities", () => {
  it("never attributes an unrelated active session to an email action", async () => {
    const enabled = {
      ...options,
      registration: true,
      password: true,
      verification: true,
    };
    const other = { email: "other@example.com", password, name: "" };
    const better = createBetterAuthAdapter(native(), enabled);
    expect(await better.signUp?.(other)).toEqual(
      success({ kind: "verification-required", delivery: "link" }),
    );
    expect(await better.signIn?.(other)).toEqual(failure("cancelled"));
    const neon = createNeonAdapter(
      native(),
      { $fetch: async () => ({}) },
      enabled,
    );
    expect(await neon.signUp?.(other)).toEqual(
      success({ kind: "verification-required", delivery: "code" }),
    );
    const verified = native();
    verified.getSession = async () => ({
      data: {
        session: { expiresAt: new Date(Date.now() + 60_000) },
        user: { id: "old", email: "original@example.com", emailVerified: true },
      },
    });
    expect(
      await createNeonAdapter(
        verified,
        { $fetch: async () => ({}) },
        enabled,
      ).verifyEmail?.({ email: other.email, code: "123456" }),
    ).toEqual(success({ kind: "complete" }));
    const supabase = createSupabaseAdapter(
      {
        getUser: async () => ({
          data: {
            user: {
              id: "old",
              email: "original@example.com",
              email_confirmed_at: "2026-11-01",
            },
          },
        }),
        signInWithPassword: async () => ({}),
        signUp: async () => ({ data: { session: {} } }),
        signOut: async () => ({}),
      },
      { ...options, registration: true, password: true },
    );
    expect(await supabase.signIn?.(other)).toEqual(failure("cancelled"));
    expect(await supabase.signUp?.(other)).toEqual(failure("cancelled"));
  });
  it("rejects enabled Better Auth features when the SDK port cannot implement them", () => {
    const port: BetterAuthClientPort = {
      getSession: async () => ({ data: null }),
      signOut: async () => ({}),
      signIn: {},
    };
    expect(() =>
      createBetterAuthAdapter(port, { ...options, password: true }),
    ).toThrow("signIn.email");
    expect(() =>
      createBetterAuthAdapter(port, { ...options, registration: true }),
    ).toThrow("signUp.email");
    expect(() =>
      createBetterAuthAdapter(port, { ...options, providers: ["github"] }),
    ).toThrow("signIn.social");
    expect(() =>
      createBetterAuthAdapter(port, { ...options, recovery: true }),
    ).toThrow("recovery");
    expect(() =>
      createBetterAuthAdapter(port, { ...options, verification: true }),
    ).toThrow("sendVerificationEmail");
  });
  it("rejects enabled Supabase features instead of rendering unusable controls", () => {
    const port: SupabaseAuthPort<string> = {
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({}),
    };
    expect(() =>
      createSupabaseAdapter(port, { ...options, password: true }),
    ).toThrow("signInWithPassword");
    expect(() =>
      createSupabaseAdapter(port, { ...options, registration: true }),
    ).toThrow("signUp");
    expect(() =>
      createSupabaseAdapter(port, { ...options, providers: ["github"] }),
    ).toThrow("signInWithOAuth");
    expect(() =>
      createSupabaseAdapter(port, { ...options, recovery: true }),
    ).toThrow("recovery");
    expect(() =>
      createSupabaseAdapter(port, { ...options, verification: true }),
    ).toThrow("resend");
  });
  it("preserves the configured provider allowlist if the original array is later changed", async () => {
    const providers = ["github"];
    const social = vi.fn(async () => ({}));
    const port = native();
    port.signIn.social = social;
    const auth = createBetterAuthAdapter(port, { ...options, providers });
    providers.push("google");
    expect(await auth.signInWithProvider?.("google")).toEqual(
      failure("unsupported"),
    );
    expect(social).not.toHaveBeenCalled();
    const hostedProviders = ["company"];
    const hosted = createHostedAdapter(
      {
        verifySession: async () => success(null),
        openSignIn: async () => {},
        signOut: async () => {},
      },
      hostedProviders,
    );
    hostedProviders.push("unexpected");
    expect(await hosted.signInWithProvider?.("unexpected")).toEqual(
      failure("unsupported"),
    );
  });
  it("lets the controller apply the verified-email policy to a real native signup session", async () => {
    const enabled = {
      ...options,
      password: true,
      registration: true,
      recovery: true,
      verification: true,
    };
    const auth = createAuthController({
      adapter: createBetterAuthAdapter(native(), enabled),
      methods: passwordOnly,
    });
    expect(
      await auth.signUp(
        { email: "ray@example.com", name: "Ray", password },
        password,
      ),
    ).toEqual(success({ kind: "verification-required", delivery: "link" }));
    expect(auth.getSnapshot().session).toBeNull();
    const allowed = createAuthController({
      adapter: createBetterAuthAdapter(native(), enabled),
      methods: passwordOnly,
      requireVerifiedEmail: false,
    });
    expect(
      (
        await allowed.signUp(
          { email: "ray@example.com", name: "Ray", password },
          password,
        )
      ).ok,
    ).toBe(true);
    expect(allowed.getSnapshot().status).toBe("authenticated");
  });
  it("preserves the same signup policy for Neon's native sessions", async () => {
    const enabled = {
      ...options,
      password: true,
      registration: true,
      recovery: true,
      verification: true,
    };
    const auth = createAuthController({
      adapter: createNeonAdapter(
        native(),
        { $fetch: async () => ({}) },
        enabled,
      ),
      methods: passwordOnly,
    });
    expect(
      await auth.signUp(
        { email: "ray@example.com", name: "Ray", password },
        password,
      ),
    ).toEqual(success({ kind: "verification-required", delivery: "code" }));
  });
  it("treats a missing-session response as signed out even if stale user data is attached", async () => {
    const port: SupabaseAuthPort<string> = {
      getUser: async () => ({
        error: { name: "AuthSessionMissingError" },
        data: {
          user: { id: session.user.id, email_confirmed_at: "2026-11-08" },
        },
      }),
      signOut: async () => ({}),
    };
    expect(await createSupabaseAdapter(port, options).getSession()).toEqual(
      success(null),
    );
  });
});
