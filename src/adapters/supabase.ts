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
} from "./shared.js";

/** Pass client.auth. Structural typing keeps Supabase out of unrelated consumer bundles. */
export interface SupabaseAuthPort<P extends string> {
  getUser(): Promise<ServiceResponse>;
  signOut(options: { scope: "local" }): Promise<{ error?: unknown }>;
  onAuthStateChange?(listener: () => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword?(input: {
    email: string;
    password: string;
  }): Promise<ServiceResponse>;
  signUp?(input: {
    email: string;
    password: string;
    options: { emailRedirectTo: string; data: { name: string } };
  }): Promise<ServiceResponse>;
  signInWithOAuth?(input: {
    provider: P;
    options: { redirectTo: string };
  }): Promise<ServiceResponse>;
  resetPasswordForEmail?(
    email: string,
    options: { redirectTo: string },
  ): Promise<ServiceResponse>;
  updateUser?(input: { password: string }): Promise<ServiceResponse>;
  resend?(input: {
    type: "signup";
    email: string;
    options: { emailRedirectTo: string };
  }): Promise<ServiceResponse>;
}
export interface SupabaseAdapterOptions<P extends string> {
  providers: readonly P[];
  /** Fixed, application-owned callback URLs, allowlisted at Supabase. Never accept arbitrary next URLs. */
  callbackUrl: string;
  recoveryUrl: string;
  password?: boolean;
  registration?: boolean;
  recovery?: boolean;
  verification?: boolean;
}
export function createSupabaseAdapter<P extends string>(
  auth: SupabaseAuthPort<P>,
  options: SupabaseAdapterOptions<P>,
): AuthAdapter {
  const providers = new Map<string, P>(
    options.providers.map((provider) => [provider, provider]),
  );
  async function getSession(): Promise<AuthResult<AuthSession | null>> {
    const response = await auth.getUser();
    const error = serviceError(response);
    // A missing session is normal for signed-out visitors.
    const missing =
      isRecord(response.error) &&
      response.error.name === "AuthSessionMissingError";
    if (
      error &&
      !missing &&
      !["session_not_found", "auth_session_missing"].includes(
        errorCode(response),
      )
    )
      return error;
    const data = isRecord(response.data) ? response.data : null;
    return success(sessionFromUser(data?.user, "supabase"));
  }
  async function authenticated(): Promise<AuthResult<AuthOutcome>> {
    const result = await getSession();
    if (!result.ok) return result;
    return result.value
      ? success({ kind: "authenticated", session: result.value })
      : failure("invalid-credentials");
  }
  return {
    id: "supabase",
    capabilities: {
      password: options.password ?? false,
      registration: options.registration ?? false,
      recovery: options.recovery ? "link" : false,
      verification: options.verification ? "link" : false,
      providers: [...options.providers],
    },
    getSession,
    subscribe(listener) {
      const subscription = auth.onAuthStateChange?.(listener);
      return () => subscription?.data.subscription.unsubscribe();
    },
    async signOut() {
      const response = await auth.signOut({ scope: "local" });
      return serviceError(response) ?? success({ kind: "complete" });
    },
    async signIn(input) {
      if (!options.password || !auth.signInWithPassword)
        return failure("unsupported");
      const response = await auth.signInWithPassword(input);
      return serviceError(response) ?? authenticated();
    },
    async signUp(input) {
      if (!options.registration || !auth.signUp) return failure("unsupported");
      const response = await auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: options.callbackUrl,
          data: { name: input.name },
        },
      });
      if (["user_already_exists", "email_exists"].includes(errorCode(response)))
        return success({ kind: "verification-required", delivery: "link" });
      const error = serviceError(response);
      if (error) return error;
      return isRecord(response.data) && response.data.session
        ? authenticated()
        : success({ kind: "verification-required", delivery: "link" });
    },
    async signInWithProvider(provider) {
      const selected = providers.get(provider);
      if (!selected || !auth.signInWithOAuth) return failure("unsupported");
      const response = await auth.signInWithOAuth({
        provider: selected,
        options: { redirectTo: options.callbackUrl },
      });
      const error = serviceError(response);
      if (error) return error;
      return isRecord(response.data) && typeof response.data.url === "string"
        ? success({ kind: "redirecting" })
        : failure("unavailable");
    },
    async requestPasswordReset(email) {
      if (!options.recovery || !auth.resetPasswordForEmail)
        return failure("unsupported");
      const response = await auth.resetPasswordForEmail(email, {
        redirectTo: options.recoveryUrl,
      });
      if (errorCode(response) === "user_not_found")
        return success({ kind: "sent", delivery: "link" });
      return (
        serviceError(response) ?? success({ kind: "sent", delivery: "link" })
      );
    },
    async resetPassword(input) {
      if (!options.recovery || !auth.updateUser) return failure("unsupported");
      const verified = await getSession();
      if (!verified.ok || !verified.value) return failure("expired");
      const response = await auth.updateUser({ password: input.password });
      const error = serviceError(response);
      if (error) return error;
      return (
        serviceError(await auth.signOut({ scope: "local" })) ??
        success({ kind: "complete" })
      );
    },
    async resendVerification(email) {
      if (!options.verification || !auth.resend) return failure("unsupported");
      const response = await auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: options.callbackUrl },
      });
      if (errorCode(response) === "user_not_found")
        return success({ kind: "sent", delivery: "link" });
      return (
        serviceError(response) ?? success({ kind: "sent", delivery: "link" })
      );
    },
  };
}
