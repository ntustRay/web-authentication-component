import { failure, success } from "../errors.js";
import type { AuthAdapter, AuthResult, AuthSession } from "../types.js";
export interface HostedAuthPort {
  /** Revalidate through the host's server, not localStorage or user-editable claims. */
  verifySession(): Promise<AuthResult<AuthSession | null>>;
  openSignIn(provider: string): Promise<void>;
  signOut(): Promise<void>;
  watchSession?: (listener: () => void) => () => void;
}
export function createHostedAdapter(
  port: HostedAuthPort,
  providers: readonly string[],
): AuthAdapter {
  return {
    id: "hosted",
    capabilities: {
      password: false,
      registration: false,
      recovery: false,
      verification: false,
      providers: [...providers],
    },
    getSession: () => port.verifySession(),
    subscribe: (listener) => port.watchSession?.(listener) ?? (() => {}),
    async signOut() {
      await port.signOut();
      return success({ kind: "complete" });
    },
    async signInWithProvider(provider) {
      if (!providers.includes(provider)) return failure("unsupported");
      await port.openSignIn(provider);
      return success({ kind: "redirecting" });
    },
  };
}
/** Keep Clerk's modal and backend authorization; share presentation and state around it. */
export function createClerkAdapter(
  port: Omit<HostedAuthPort, "openSignIn"> & { openSignIn(): Promise<void> },
): AuthAdapter {
  return {
    ...createHostedAdapter({ ...port, openSignIn: () => port.openSignIn() }, [
      "clerk",
    ]),
    id: "clerk",
  };
}
