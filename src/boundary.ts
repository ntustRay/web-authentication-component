import { failure, normalizeError, success } from "./errors.js";
import type {
  AuthError,
  AuthErrorCode,
  AuthOutcome,
  AuthResult,
  AuthSession,
} from "./types.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
const errorCodes: readonly AuthErrorCode[] = [
  "invalid-input",
  "invalid-credentials",
  "verification-required",
  "rate-limited",
  "unavailable",
  "unsupported",
  "expired",
  "weak-password",
  "cancelled",
  "timeout",
  "unknown",
];
function knownCode(value: unknown): value is AuthErrorCode {
  return errorCodes.some((code) => code === value);
}
/** Structural compatibility does not remove extra SDK fields. Rebuild public values explicitly. */
export function publicError(value: unknown): AuthError {
  if (!record(value) || !knownCode(value.code)) {
    const normalized = normalizeError(value);
    return Object.freeze({
      code: knownCode(normalized.code) ? normalized.code : "unknown",
      retryAfterSeconds: normalized.retryAfterSeconds,
    });
  }
  const retry = value.retryAfterSeconds;
  return Object.freeze({
    code: value.code,
    retryAfterSeconds:
      typeof retry === "number" && Number.isFinite(retry)
        ? Math.max(1, Math.min(3600, Math.ceil(retry)))
        : null,
  });
}
export function publicSession(value: unknown): AuthResult<AuthSession | null> {
  if (value === null) return success(null);
  if (
    !record(value) ||
    !record(value.user) ||
    typeof value.user.id !== "string" ||
    !value.user.id
  )
    return failure("unavailable");
  if (
    value.expiresAt !== null &&
    (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt))
  )
    return failure("unavailable");
  return success(
    Object.freeze({
      user: Object.freeze({
        id: value.user.id,
        email: typeof value.user.email === "string" ? value.user.email : null,
        name: typeof value.user.name === "string" ? value.user.name : null,
        emailVerified: value.user.emailVerified === true,
      }),
      expiresAt: value.expiresAt,
    }),
  );
}
export function publicFailure(error: unknown): AuthResult<never> {
  return Object.freeze({ ok: false, error: publicError(error) });
}
export function publicSessionResult(
  result: unknown,
): AuthResult<AuthSession | null> {
  if (!record(result)) return failure("unavailable");
  return result.ok === true
    ? publicSession(result.value)
    : result.ok === false
      ? publicFailure(result.error)
      : failure("unavailable");
}
export function publicOutcome(result: unknown): AuthResult<AuthOutcome> {
  if (!record(result)) return failure("unavailable");
  if (result.ok === false) return publicFailure(result.error);
  if (result.ok !== true || !record(result.value))
    return failure("unavailable");
  const value = result.value;
  if (value.kind === "authenticated") {
    const session = publicSession(value.session);
    if (!session.ok) return session;
    return session.value
      ? Object.freeze(
          success(
            Object.freeze({ kind: "authenticated", session: session.value }),
          ),
        )
      : failure("unavailable");
  }
  if (value.kind === "complete" || value.kind === "redirecting")
    return Object.freeze(success(Object.freeze({ kind: value.kind })));
  if (
    (value.kind === "sent" || value.kind === "verification-required") &&
    (value.delivery === "link" || value.delivery === "code")
  )
    return Object.freeze(
      success(Object.freeze({ kind: value.kind, delivery: value.delivery })),
    );
  return failure("unavailable");
}
