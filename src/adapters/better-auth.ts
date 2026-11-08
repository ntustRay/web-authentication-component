import { failure, success } from "../errors.js";
import type {
  AuthAdapter,
  AuthOutcome,
  AuthResult,
  AuthSession,
} from "../types.js";
import {
  errorCode,
  isRecord,
  type ServiceResponse,
  serviceError,
  sessionFromUser,
  validateAdapterPort,
} from "./shared.js";

export interface BetterAuthClientPort {
  getSession(input: {
    query: { disableCookieCache: boolean };
  }): Promise<ServiceResponse>;
  signOut(): Promise<ServiceResponse>;
  signIn: {
    email?(input: {
      email: string;
      password: string;
    }): Promise<ServiceResponse>;
    social?(input: {
      provider: string;
      callbackURL: string;
      errorCallbackURL: string;
    }): Promise<ServiceResponse>;
  };
  signUp?: {
    email(input: {
      email: string;
      password: string;
      name: string;
      callbackURL: string;
    }): Promise<ServiceResponse>;
  };
  requestPasswordReset?(input: {
    email: string;
    redirectTo: string;
  }): Promise<ServiceResponse>;
  resetPassword?(input: {
    newPassword: string;
    token: string;
  }): Promise<ServiceResponse>;
  sendVerificationEmail?(input: {
    email: string;
    callbackURL: string;
  }): Promise<ServiceResponse>;
}
export interface BetterAuthAdapterOptions {
  providers: readonly string[];
  callbackUrl: string;
  errorCallbackUrl: string;
  recoveryUrl: string;
  password?: boolean;
  registration?: boolean;
  recovery?: boolean;
  verification?: boolean;
  /** Managed services can supply a forced server-session read through their own SDK. */
  readSession?: () => Promise<ServiceResponse>;
  watchSession?: (listener: () => void) => () => void;
}
export function createBetterAuthAdapter(
  client: BetterAuthClientPort,
  input: BetterAuthAdapterOptions,
): AuthAdapter {
  const options = { ...input, providers: Object.freeze([...input.providers]) };
  validateAdapterPort("Better Auth", [
    [
      true,
      typeof options.readSession === "function" ||
        typeof client.getSession === "function",
      "getSession",
    ],
    [true, typeof client.signOut === "function", "signOut"],
    [
      !!options.password,
      typeof client.signIn.email === "function",
      "signIn.email",
    ],
    [
      !!options.registration,
      typeof client.signUp?.email === "function",
      "signUp.email",
    ],
    [
      options.providers.length > 0,
      typeof client.signIn.social === "function",
      "signIn.social",
    ],
    [
      !!options.recovery,
      typeof client.requestPasswordReset === "function" &&
        typeof client.resetPassword === "function",
      "password recovery methods",
    ],
    [
      !!options.verification,
      typeof client.sendVerificationEmail === "function",
      "sendVerificationEmail",
    ],
  ]);
  async function getSession(): Promise<AuthResult<AuthSession | null>> {
    const response = await (options.readSession
      ? options.readSession()
      : client.getSession({ query: { disableCookieCache: true } }));
    const error = serviceError(response);
    if (error) return error;
    const data = isRecord(response.data) ? response.data : null;
    const session = data && isRecord(data.session) ? data.session : null;
    if (!session) return success(null);
    return success(
      sessionFromUser(data?.user, "better-auth", session?.expiresAt),
    );
  }
  async function authenticated(): Promise<AuthResult<AuthOutcome>> {
    const result = await getSession();
    if (!result.ok) return result;
    return result.value
      ? success({ kind: "authenticated", session: result.value })
      : failure("invalid-credentials");
  }
  return {
    id: "better-auth",
    capabilities: {
      password: options.password ?? false,
      registration: options.registration ?? false,
      recovery: options.recovery ? "link" : false,
      verification: options.verification ? "link" : false,
      providers: [...options.providers],
    },
    getSession,
    subscribe(listener) {
      return options.watchSession?.(listener) ?? (() => {});
    },
    async signOut() {
      return (
        serviceError(await client.signOut()) ?? success({ kind: "complete" })
      );
    },
    async signIn(input) {
      if (!options.password || !client.signIn.email)
        return failure("unsupported");
      return serviceError(await client.signIn.email(input)) ?? authenticated();
    },
    async signUp(input) {
      if (!options.registration || !client.signUp)
        return failure("unsupported");
      const response = await client.signUp.email({
        ...input,
        name: input.name || input.email.split("@")[0] || "Member",
        callbackURL: options.callbackUrl,
      });
      if (
        [
          "user_already_exists",
          "user_already_exists_use_another_email",
        ].includes(errorCode(response))
      )
        return success({ kind: "verification-required", delivery: "link" });
      const error = serviceError(response);
      if (error) return error;
      const result = await getSession();
      if (!result.ok) return result;
      return result.value
        ? success({ kind: "authenticated", session: result.value })
        : success({ kind: "verification-required", delivery: "link" });
    },
    async signInWithProvider(provider) {
      if (!options.providers.includes(provider) || !client.signIn.social)
        return failure("unsupported");
      return (
        serviceError(
          await client.signIn.social({
            provider,
            callbackURL: options.callbackUrl,
            errorCallbackURL: options.errorCallbackUrl,
          }),
        ) ?? success({ kind: "redirecting" })
      );
    },
    async requestPasswordReset(email) {
      if (!options.recovery || !client.requestPasswordReset)
        return failure("unsupported");
      const response = await client.requestPasswordReset({
        email,
        redirectTo: options.recoveryUrl,
      });
      if (errorCode(response) === "user_not_found")
        return success({ kind: "sent", delivery: "link" });
      return (
        serviceError(response) ?? success({ kind: "sent", delivery: "link" })
      );
    },
    async resetPassword(input) {
      if (!options.recovery || !client.resetPassword)
        return failure("unsupported");
      if (!input.token) return failure("expired");
      const error = serviceError(
        await client.resetPassword({
          newPassword: input.password,
          token: input.token,
        }),
      );
      if (error) return error;
      return (
        serviceError(await client.signOut()) ?? success({ kind: "complete" })
      );
    },
    async resendVerification(email) {
      if (!options.verification || !client.sendVerificationEmail)
        return failure("unsupported");
      const response = await client.sendVerificationEmail({
        email,
        callbackURL: options.callbackUrl,
      });
      if (errorCode(response) === "user_not_found")
        return success({ kind: "sent", delivery: "link" });
      return (
        serviceError(response) ?? success({ kind: "sent", delivery: "link" })
      );
    },
  };
}
