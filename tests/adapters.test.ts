import { describe, expect, it, vi } from "vitest";
import {
  type BetterAuthClientPort,
  createBetterAuthAdapter,
} from "../src/adapters/better-auth.js";
import { createClerkAdapter } from "../src/adapters/hosted.js";
import { createNeonAdapter } from "../src/adapters/neon.js";
import {
  createSupabaseAdapter,
  type SupabaseAuthPort,
} from "../src/adapters/supabase.js";
import { failure, success } from "../src/errors.js";
import { password, session } from "./helpers.js";

const options = {
  providers: ["github"],
  callbackUrl: "https://app.example/callback",
  errorCallbackUrl: "https://app.example/login",
  recoveryUrl: "https://app.example/recovery",
  password: true,
  registration: true,
  recovery: true,
  verification: true,
};
function better(
  overrides: Partial<BetterAuthClientPort> = {},
): BetterAuthClientPort {
  return {
    getSession: async () => ({
      data: {
        user: {
          id: "member-1",
          email: "ray@example.com",
          name: "Ray",
          emailVerified: true,
        },
        session: { expiresAt: "2099-01-01T00:00:00Z", token: "must-not-leak" },
      },
    }),
    signOut: async () => ({}),
    signIn: {
      email: async () => ({}),
      social: async () => ({ data: { url: "https://github.com/login/oauth" } }),
    },
    signUp: { email: async () => ({}) },
    ...overrides,
  };
}
function supabase(
  overrides: Partial<SupabaseAuthPort<string>> = {},
): SupabaseAuthPort<string> {
  return {
    getUser: async () => ({
      data: {
        user: {
          id: "member-1",
          email: "ray@example.com",
          email_confirmed_at: "2026-11-01",
          user_metadata: { emailVerified: false },
        },
      },
    }),
    signOut: async () => ({}),
    signInWithPassword: async () => ({}),
    signUp: async () => ({ data: { session: null } }),
    signInWithOAuth: async () => ({
      data: { url: "https://github.com/login/oauth" },
    }),
    ...overrides,
  };
}
describe("Supabase adapter", () => {
  it("verifies with getUser and omits tokens/metadata", async () => {
    const auth = createSupabaseAdapter(supabase(), options);
    const result = await auth.signIn?.({ email: "ray@example.com", password });
    expect(result?.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("user_metadata");
  });
  it("treats missing sessions as anonymous", async () => {
    const auth = createSupabaseAdapter(
      supabase({
        getUser: async () => ({
          data: { user: null },
          error: { name: "AuthSessionMissingError", status: 400 },
        }),
      }),
      options,
    );
    expect(await auth.getSession()).toEqual(success(null));
  });
  it("does not trust user-editable metadata as verification", async () => {
    const auth = createSupabaseAdapter(
      supabase({
        getUser: async () => ({
          data: { user: { id: "x", user_metadata: { emailVerified: true } } },
        }),
      }),
      options,
    );
    const result = await auth.getSession();
    expect(result.ok && result.value?.user.emailVerified).toBe(false);
  });
  it("requires email verification when signup has no session", async () => {
    const auth = createSupabaseAdapter(supabase(), options);
    expect(
      await auth.signUp?.({ email: "ray@example.com", password, name: "Ray" }),
    ).toEqual(success({ kind: "verification-required", delivery: "link" }));
  });
  it("preserves safe request-limit codes and never echoes raw messages", async () => {
    const auth = createSupabaseAdapter(
      supabase({
        signInWithPassword: async () => ({
          error: {
            status: 429,
            code: "over_request_rate_limit",
            message: "secret email",
          },
        }),
      }),
      options,
    );
    const result = await auth.signIn?.({ email: "ray@example.com", password });
    expect(result).toEqual(failure("rate-limited", 60));
    expect(JSON.stringify(result)).not.toContain("secret email");
  });
  it("does not enumerate absent recovery email addresses", async () => {
    const auth = createSupabaseAdapter(
      supabase({
        resetPasswordForEmail: async () => ({
          error: { code: "user_not_found" },
        }),
      }),
      options,
    );
    expect(await auth.requestPasswordReset?.("missing@example.com")).toEqual(
      success({ kind: "sent", delivery: "link" }),
    );
  });
  it("rejects disabled providers before the OAuth SDK", async () => {
    const oauth = vi.fn();
    const auth = createSupabaseAdapter(
      supabase({ signInWithOAuth: oauth }),
      options,
    );
    expect(await auth.signInWithProvider?.("google")).toEqual(
      failure("unsupported"),
    );
    expect(oauth).not.toHaveBeenCalled();
  });
  it("signs out locally after updating a password", async () => {
    const signOut = vi.fn(async () => ({}));
    const updateUser = vi.fn(async () => ({}));
    const auth = createSupabaseAdapter(
      supabase({ signOut, updateUser }),
      options,
    );
    expect(
      await auth.resetPassword?.({ email: "", code: "", token: "", password }),
    ).toEqual(success({ kind: "complete" }));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
describe("Better Auth, Neon and hosted adapters", () => {
  it("forces a server session read and strips the SDK's token", async () => {
    const getSession = vi.fn(better().getSession);
    const auth = createBetterAuthAdapter(better({ getSession }), options);
    const result = await auth.getSession();
    expect(getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });
  it("uses the configured provider and fixed callback URLs", async () => {
    const social = vi.fn(async () => ({}));
    const auth = createBetterAuthAdapter(
      better({ signIn: { social } }),
      options,
    );
    await auth.signInWithProvider?.("github");
    expect(social).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: options.callbackUrl,
      errorCallbackURL: options.errorCallbackUrl,
    });
  });
  it("keeps unverified native signups out of authenticated state", async () => {
    const auth = createBetterAuthAdapter(
      better({
        getSession: async () => ({
          data: { user: { id: "x", emailVerified: false } },
        }),
      }),
      options,
    );
    expect(
      await auth.signUp?.({ email: "ray@example.com", password, name: "" }),
    ).toEqual(success({ kind: "verification-required", delivery: "link" }));
  });
  it("uses Neon's native OTP endpoint instead of Supabase updateUser", async () => {
    const request = vi.fn(async () => ({}));
    const signOut = vi.fn(async () => ({}));
    const auth = createNeonAdapter(
      better({ signOut }),
      { $fetch: request },
      options,
    );
    expect(auth.capabilities.recovery).toBe("code");
    await auth.resetPassword?.({
      email: "ray@example.com",
      code: "123456",
      password,
      token: "",
    });
    expect(request).toHaveBeenCalledWith("/email-otp/reset-password", {
      method: "POST",
      body: { email: "ray@example.com", otp: "123456", password },
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
  it("does not claim code verification signed in unless a session exists", async () => {
    const auth = createNeonAdapter(
      better({ getSession: async () => ({ data: null }) }),
      { $fetch: async () => ({}) },
      options,
    );
    expect(
      await auth.verifyEmail?.({ email: "ray@example.com", code: "123456" }),
    ).toEqual(success({ kind: "complete" }));
  });
  it("adapts Clerk's hosted modal without switching identity", async () => {
    const openSignIn = vi.fn(async () => {});
    const auth = createClerkAdapter({
      verifySession: async () => success(session),
      openSignIn,
      signOut: async () => {},
    });
    expect(auth.capabilities.password).toBe(false);
    expect(await auth.getSession()).toEqual(success(session));
    await auth.signInWithProvider?.("clerk");
    expect(openSignIn).toHaveBeenCalledTimes(1);
    expect(await auth.signInWithProvider?.("github")).toEqual(
      failure("unsupported"),
    );
  });
});
