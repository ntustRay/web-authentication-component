import type { AuthConfig, AuthMethods } from "./types.js";
export const githubOnly: AuthMethods = Object.freeze({
  password: false,
  registration: false,
  recovery: false,
  verification: false,
  providers: Object.freeze([{ id: "github", label: "GitHub" }]),
});
export const passwordOnly: AuthMethods = Object.freeze({
  password: true,
  registration: true,
  recovery: true,
  verification: true,
  providers: Object.freeze([]),
});
export function validateConfig(config: AuthConfig): void {
  const { adapter, methods } = config;
  const caps = adapter.capabilities;
  const needs = [
    [methods.password, caps.password && !!adapter.signIn, "password"],
    [
      methods.registration,
      methods.password && caps.registration && !!adapter.signUp,
      "registration",
    ],
    [
      methods.recovery,
      methods.password &&
        !!caps.recovery &&
        !!adapter.requestPasswordReset &&
        !!adapter.resetPassword,
      "recovery",
    ],
    [
      methods.verification,
      methods.password &&
        !!caps.verification &&
        !!adapter.resendVerification &&
        (caps.verification !== "code" || !!adapter.verifyEmail),
      "verification",
    ],
  ];
  for (const [enabled, supported, name] of needs)
    if (enabled && !supported)
      throw new Error(`Adapter ${adapter.id} does not support ${name}`);
  const ids = methods.providers.map((provider) => provider.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim()))
    throw new Error("Provider IDs must be unique and nonempty");
  for (const provider of ids)
    if (!caps.providers.includes(provider) || !adapter.signInWithProvider)
      throw new Error(`Unsupported provider: ${provider}`);
  if (!methods.password && ids.length === 0)
    throw new Error("Enable at least one authentication method");
  if (
    config.timeoutMs !== undefined &&
    (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 100)
  )
    throw new Error("timeoutMs must be >= 100");
  if (
    config.cooldownSeconds !== undefined &&
    (!Number.isFinite(config.cooldownSeconds) || config.cooldownSeconds < 0)
  )
    throw new Error("Invalid cooldown");
}
/** Host-controlled relative destinations only. Reject URL-parser slash/backslash ambiguities. */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  function safe(candidate: string): boolean {
    let decoded = candidate;
    try {
      for (let i = 0; i < 3; i++) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      }
    } catch {
      return false;
    }
    return (
      decoded.startsWith("/") &&
      !decoded.startsWith("//") &&
      ![...decoded].some(
        (character) =>
          character === "\\" ||
          character.charCodeAt(0) <= 32 ||
          character.charCodeAt(0) === 127,
      )
    );
  }
  const safeFallback = safe(fallback) ? fallback : "/";
  return value && safe(value) ? value : safeFallback;
}
