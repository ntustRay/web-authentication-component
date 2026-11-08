import type { AuthError, AuthErrorCode, AuthResult } from "./types.js";
export function success<T>(value: T): AuthResult<T> {
  return { ok: true, value };
}
export function failure(
  code: AuthErrorCode,
  retryAfterSeconds: number | null = null,
): AuthResult<never> {
  return { ok: false, error: { code, retryAfterSeconds } };
}
export class AuthFailure extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthFailure";
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
/** Raw backend messages may contain PII. Only known codes and bounded retry hints cross this boundary. */
export function normalizeError(value: unknown): AuthError {
  if (value instanceof AuthFailure) {
    const hint = "retryAfterSeconds" in value ? value.retryAfterSeconds : null;
    return {
      code: value.code,
      retryAfterSeconds:
        typeof hint === "number" && Number.isFinite(hint)
          ? Math.min(3600, Math.max(1, Math.ceil(hint)))
          : null,
    };
  }
  if (!record(value)) return { code: "unknown", retryAfterSeconds: null };
  const code = typeof value.code === "string" ? value.code.toLowerCase() : "";
  const status = typeof value.status === "number" ? value.status : 0;
  const retry =
    typeof value.retryAfterSeconds === "number" &&
    Number.isFinite(value.retryAfterSeconds)
      ? Math.min(3600, Math.max(1, Math.ceil(value.retryAfterSeconds)))
      : null;
  if (status === 429 || /rate_limit|too_many_requests/.test(code))
    return { code: "rate-limited", retryAfterSeconds: retry ?? 60 };
  if (/email_not_confirmed|email_not_verified/.test(code))
    return { code: "verification-required", retryAfterSeconds: null };
  if (
    /invalid_credentials|invalid_email_or_password|invalid_password|user_not_found/.test(
      code,
    )
  )
    return { code: "invalid-credentials", retryAfterSeconds: null };
  if (/weak_password|password_too_short|password_too_long/.test(code))
    return { code: "weak-password", retryAfterSeconds: null };
  if (
    /otp_expired|invalid_token|token_expired|invalid_otp|invalid_otp_code/.test(
      code,
    )
  )
    return { code: "expired", retryAfterSeconds: null };
  if (/access_denied|user_cancelled|cancelled/.test(code))
    return { code: "cancelled", retryAfterSeconds: null };
  if (status >= 500 || code === "network_error" || value instanceof TypeError)
    return { code: "unavailable", retryAfterSeconds: null };
  return { code: "unknown", retryAfterSeconds: null };
}
export async function capture<T>(
  work: () => Promise<AuthResult<T>>,
): Promise<AuthResult<T>> {
  try {
    return await work();
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}
