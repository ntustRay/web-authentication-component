import { failure, success } from "../errors.js";
import type { AuthAdapter } from "../types.js";
import {
  type BetterAuthAdapterOptions,
  type BetterAuthClientPort,
  createBetterAuthAdapter,
} from "./better-auth.js";
import {
  errorCode,
  type ServiceResponse,
  serviceError,
  validateAdapterPort,
} from "./shared.js";

/** Pass the native Managed SDK, including $fetch; keep Neon's verifier/cookie handling. */
export interface NeonOtpPort {
  $fetch(
    path: string,
    input: { method: "POST"; body: Record<string, string> },
  ): Promise<ServiceResponse>;
}
export function createNeonAdapter(
  client: BetterAuthClientPort,
  otp: NeonOtpPort,
  input: BetterAuthAdapterOptions,
): AuthAdapter {
  const options = { ...input, providers: Object.freeze([...input.providers]) };
  validateAdapterPort("Neon", [
    [
      !!options.recovery || !!options.verification,
      typeof otp.$fetch === "function",
      "$fetch for OTP",
    ],
  ]);
  const base = createBetterAuthAdapter(client, {
    ...options,
    recovery: false,
    verification: false,
  });
  return {
    ...base,
    id: "neon",
    capabilities: {
      ...base.capabilities,
      recovery: options.recovery ? "code" : false,
      verification: options.verification ? "code" : false,
    },
    async signUp(input) {
      const result = await base.signUp?.(input);
      if (!result) return failure("unsupported");
      return result.ok && result.value.kind === "verification-required"
        ? success({ kind: "verification-required", delivery: "code" })
        : result;
    },
    async requestPasswordReset(email) {
      if (!options.recovery) return failure("unsupported");
      const response = await otp.$fetch("/email-otp/request-password-reset", {
        method: "POST",
        body: { email },
      });
      if (errorCode(response) === "user_not_found")
        return success({ kind: "sent", delivery: "code" });
      return (
        serviceError(response) ?? success({ kind: "sent", delivery: "code" })
      );
    },
    async resetPassword(input) {
      if (!options.recovery) return failure("unsupported");
      const response = await otp.$fetch("/email-otp/reset-password", {
        method: "POST",
        body: { email: input.email, otp: input.code, password: input.password },
      });
      const error = serviceError(response);
      if (error) return error;
      return base.signOut();
    },
    async resendVerification(email) {
      if (!options.verification) return failure("unsupported");
      const response = await otp.$fetch("/email-otp/send-verification-otp", {
        method: "POST",
        body: { email, type: "email-verification" },
      });
      if (errorCode(response) === "user_not_found")
        return success({ kind: "sent", delivery: "code" });
      return (
        serviceError(response) ?? success({ kind: "sent", delivery: "code" })
      );
    },
    async verifyEmail(input) {
      if (!options.verification) return failure("unsupported");
      const response = await otp.$fetch("/email-otp/verify-email", {
        method: "POST",
        body: { email: input.email, otp: input.code },
      });
      const error = serviceError(response);
      if (error) return error;
      const session = await base.getSession();
      if (!session.ok) return session;
      return session.value?.user.emailVerified
        ? success({ kind: "authenticated", session: session.value })
        : success({ kind: "complete" });
    },
  };
}
