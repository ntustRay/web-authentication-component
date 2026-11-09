import { AuthFailure } from "../errors.js";
import type { AuthMethods } from "../types.js";

export function assertTrustedOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    throw new AuthFailure("unsupported");
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin))
    throw new AuthFailure("invalid-input");
  // Additional to the identity provider's CSRF and OAuth state/PKCE protections.
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new AuthFailure("invalid-input");
}
export function assertAllowedMethod(
  method:
    | "password"
    | "registration"
    | "recovery"
    | "verification"
    | { provider: string },
  methods: AuthMethods,
): void {
  switch (method) {
    case "password":
    case "registration":
    case "recovery":
    case "verification":
      if (methods[method] === true) return;
      break;
    default:
      if (
        typeof method === "object" &&
        method !== null &&
        Object.hasOwn(method, "provider") &&
        typeof method.provider === "string" &&
        methods.providers.some((provider) => provider.id === method.provider)
      )
        return;
  }
  throw new AuthFailure("unsupported");
}
export interface RateLimiter {
  /** Must atomically count attempts across instances (database/Redis/provider), not browser storage. */
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
export async function enforceRateLimit(
  limiter: RateLimiter,
  key: string,
  limit = 5,
  windowSeconds = 60,
): Promise<void> {
  const result = await limiter.consume(key, limit, windowSeconds);
  if (!result.allowed)
    throw new RateLimitFailure(
      Math.min(3600, Math.max(1, result.retryAfterSeconds)),
    );
}
export class RateLimitFailure extends AuthFailure {
  constructor(public readonly retryAfterSeconds: number) {
    super("rate-limited");
  }
}
