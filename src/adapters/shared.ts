import { normalizeError, success } from "../errors.js";
import type { AuthResult, AuthSession } from "../types.js";
export interface ServiceResponse {
  data?: unknown;
  error?: unknown;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function serviceError(
  response: ServiceResponse,
): AuthResult<never> | null {
  return response.error
    ? { ok: false, error: normalizeError(response.error) }
    : null;
}
export function errorCode(response: ServiceResponse): string {
  return isRecord(response.error) && typeof response.error.code === "string"
    ? response.error.code.toLowerCase()
    : "";
}
export function sessionFromUser(
  value: unknown,
  style: "supabase" | "better-auth",
  expiresAt: unknown = null,
): AuthSession | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id)
    return null;
  const expires =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === "string"
        ? Date.parse(expiresAt)
        : null;
  return {
    user: {
      id: value.id,
      email: typeof value.email === "string" ? value.email : null,
      name: typeof value.name === "string" ? value.name : null,
      emailVerified:
        style === "supabase"
          ? typeof value.email_confirmed_at === "string" &&
            !!value.email_confirmed_at
          : value.emailVerified === true,
    },
    expiresAt: expires !== null && Number.isFinite(expires) ? expires : null,
  };
}
export function emptySession(): AuthResult<AuthSession | null> {
  return success(null);
}
