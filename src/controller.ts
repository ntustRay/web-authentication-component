import { validateConfig } from "./config.js";
import { capture, failure } from "./errors.js";
import {
  assessPassword,
  isEmail,
  normalizeEmail,
  resolvePasswordPolicy,
} from "./password.js";
import type {
  AuthAction,
  AuthConfig,
  AuthEvent,
  AuthOutcome,
  AuthResult,
  AuthSession,
  AuthSnapshot,
  PasswordCredentials,
  PasswordReset,
  Registration,
} from "./types.js";

const idle = {
  phase: "idle",
  action: null,
  outcome: null,
  error: null,
} satisfies AuthSnapshot["operation"];
const initial: AuthSnapshot = Object.freeze({
  status: "checking",
  session: null,
  operation: idle,
  cooldownUntil: 0,
});

export function createAuthController(input: AuthConfig) {
  validateConfig(input);
  const config = {
    ...input,
    methods: {
      ...input.methods,
      providers: input.methods.providers.map((provider) => ({ ...provider })),
    },
  };
  const { adapter, methods } = config;
  const policy = resolvePasswordPolicy(config.passwordPolicy);
  const listeners = new Set<() => void>();
  let snapshot = initial;
  let operationVersion = 0;
  let identityVersion = 0;
  let refreshVersion = 0;
  let lifecycle = 0;
  let consumers = 0;
  let rateLimitUntil = 0;
  let unsubscribe: (() => void) | null = null;
  let sessionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingCancels = new Set<() => void>();
  function set(patch: Partial<AuthSnapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  }
  function emit(event: AuthEvent) {
    // Observability must never change whether authentication succeeds.
    try {
      config.onEvent?.(event);
    } catch {
      /* Host telemetry is isolated. */
    }
  }
  function accepted(session: AuthSession): boolean {
    return (
      (!(config.requireVerifiedEmail ?? true) || session.user.emailVerified) &&
      (session.expiresAt === null || session.expiresAt > Date.now())
    );
  }
  async function bounded<T>(
    work: () => Promise<AuthResult<T>>,
  ): Promise<AuthResult<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    const timeout = new Promise<AuthResult<T>>((resolve) => {
      cancel = () => resolve(failure("cancelled"));
      pendingCancels.add(cancel);
      timer = setTimeout(
        () => resolve(failure("timeout")),
        config.timeoutMs ?? 30_000,
      );
    });
    try {
      return await Promise.race([capture(work), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      pendingCancels.delete(cancel);
    }
  }
  async function refresh(): Promise<void> {
    const request = ++refreshVersion;
    const identity = identityVersion;
    const life = lifecycle;
    const result = await bounded(() => adapter.getSession());
    if (
      request !== refreshVersion ||
      identity !== identityVersion ||
      life !== lifecycle
    )
      return;
    if (!result.ok) {
      set({ status: "unavailable", session: null });
      return;
    }
    const session = result.value;
    set({
      status: session && accepted(session) ? "authenticated" : "anonymous",
      session: session && accepted(session) ? session : null,
    });
    if (session && !accepted(session))
      set({
        operation: {
          phase: "error",
          action: null,
          outcome: null,
          error: {
            code: session.user.emailVerified
              ? "expired"
              : "verification-required",
            retryAfterSeconds: null,
          },
        },
      });
  }
  function sessionChanged() {
    ++identityVersion;
    ++refreshVersion;
    set({ status: "checking", session: null });
    const life = lifecycle;
    // Supabase callbacks must be synchronous; SDK requests happen after its lock is released.
    if (sessionRefreshTimer !== null) clearTimeout(sessionRefreshTimer);
    sessionRefreshTimer = setTimeout(() => {
      sessionRefreshTimer = null;
      if (life === lifecycle && consumers > 0) void refresh();
    }, 0);
  }
  function start(): () => void {
    consumers++;
    if (consumers === 1) {
      try {
        unsubscribe = adapter.subscribe?.(sessionChanged) ?? null;
      } catch {
        set({ status: "unavailable", session: null });
      }
      void refresh();
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      consumers--;
      if (consumers === 0) {
        lifecycle++;
        refreshVersion++;
        operationVersion++;
        unsubscribe?.();
        unsubscribe = null;
        if (sessionRefreshTimer !== null) clearTimeout(sessionRefreshTimer);
        sessionRefreshTimer = null;
        for (const cancel of pendingCancels) cancel();
        set({ operation: idle });
      }
    };
  }
  async function operate(
    action: AuthAction,
    work: () => Promise<AuthResult<AuthOutcome>>,
  ): Promise<AuthResult<AuthOutcome>> {
    if (
      snapshot.operation.phase === "pending" ||
      snapshot.operation.phase === "redirecting"
    )
      return failure("cancelled");
    const remaining = Math.ceil((rateLimitUntil - Date.now()) / 1000);
    if (remaining > 0 && action !== "sign-out")
      return failure("rate-limited", remaining);
    if (
      (action === "forgot" || action === "resend") &&
      snapshot.cooldownUntil > Date.now()
    )
      return failure(
        "rate-limited",
        Math.ceil((snapshot.cooldownUntil - Date.now()) / 1000),
      );
    const request = ++operationVersion;
    const identity = identityVersion;
    const life = lifecycle;
    if (action === "sign-out") {
      identityVersion++;
      refreshVersion++;
      set({ status: "checking", session: null });
    }
    set({
      operation: { phase: "pending", action, outcome: null, error: null },
    });
    emit({ type: "started", action, errorCode: null });
    let result = await bounded(work);
    if (request !== operationVersion || life !== lifecycle)
      return failure("cancelled");
    if (
      result.ok &&
      result.value.kind === "authenticated" &&
      !accepted(result.value.session)
    )
      result = failure(
        result.value.session.user.emailVerified
          ? "expired"
          : "verification-required",
      );
    if (!result.ok) {
      if (result.error.code === "rate-limited")
        rateLimitUntil =
          Date.now() + (result.error.retryAfterSeconds ?? 60) * 1000;
      set({
        operation: {
          phase: "error",
          action,
          outcome: null,
          error: result.error,
        },
        cooldownUntil: Math.max(snapshot.cooldownUntil, rateLimitUntil),
      });
      if (action === "sign-out" || result.error.code === "timeout")
        set({ status: "unavailable", session: null });
      emit({ type: "failed", action, errorCode: result.error.code });
      return result;
    }
    const outcome = result.value;
    if (outcome.kind === "authenticated" && identity === identityVersion) {
      refreshVersion++;
      set({ status: "authenticated", session: outcome.session });
    }
    if (action === "sign-out") set({ status: "anonymous", session: null });
    if (action === "reset" && outcome.kind === "complete") {
      identityVersion++;
      refreshVersion++;
      set({ status: "anonymous", session: null });
    }
    if (
      action === "forgot" ||
      action === "resend" ||
      (action === "sign-up" && outcome.kind === "verification-required")
    )
      set({
        cooldownUntil: Date.now() + (config.cooldownSeconds ?? 60) * 1000,
      });
    set({
      operation: {
        phase: outcome.kind === "redirecting" ? "redirecting" : "success",
        action,
        outcome: outcome.kind,
        error: null,
      },
    });
    emit({ type: "succeeded", action, errorCode: null });
    return result;
  }
  function invalid(
    code: "invalid-input" | "weak-password" | "unsupported",
    action: AuthAction,
  ): Promise<AuthResult<AuthOutcome>> {
    if (
      snapshot.operation.phase === "pending" ||
      snapshot.operation.phase === "redirecting"
    )
      return Promise.resolve(failure("cancelled"));
    const result = failure(code);
    if (!result.ok)
      set({
        operation: {
          phase: "error",
          action,
          outcome: null,
          error: result.error,
        },
      });
    return Promise.resolve(result);
  }
  function signIn(credentials: PasswordCredentials) {
    if (!methods.password || !adapter.signIn)
      return invalid("unsupported", "sign-in");
    const email = normalizeEmail(credentials.email);
    // Never apply a NEW password policy to existing credentials, and never trim passwords.
    if (
      !isEmail(email) ||
      !credentials.password ||
      credentials.password.length > 16_384
    )
      return invalid("invalid-input", "sign-in");
    const signIn = adapter.signIn.bind(adapter);
    return operate("sign-in", () =>
      signIn({ email, password: credentials.password }),
    );
  }
  function signUp(registration: Registration, confirmation: string) {
    if (!methods.registration || !adapter.signUp)
      return invalid("unsupported", "sign-up");
    const email = normalizeEmail(registration.email);
    if (
      !isEmail(email) ||
      registration.name.trim().length > 80 ||
      registration.password !== confirmation
    )
      return invalid("invalid-input", "sign-up");
    if (!assessPassword(registration.password, policy).valid)
      return invalid("weak-password", "sign-up");
    const signUp = adapter.signUp.bind(adapter);
    return operate("sign-up", () =>
      signUp({ ...registration, email, name: registration.name.trim() }),
    );
  }
  function signInWithProvider(provider: string) {
    if (
      !adapter.signInWithProvider ||
      !methods.providers.some((item) => item.id === provider)
    )
      return invalid("unsupported", "provider");
    const signIn = adapter.signInWithProvider.bind(adapter);
    return operate("provider", () => signIn(provider));
  }
  function requestPasswordReset(value: string) {
    if (!methods.recovery || !adapter.requestPasswordReset)
      return invalid("unsupported", "forgot");
    const email = normalizeEmail(value);
    if (!isEmail(email)) return invalid("invalid-input", "forgot");
    const request = adapter.requestPasswordReset.bind(adapter);
    return operate("forgot", () => request(email));
  }
  function resetPassword(value: PasswordReset, confirmation: string) {
    if (!methods.recovery || !adapter.resetPassword)
      return invalid("unsupported", "reset");
    if (
      value.password !== confirmation ||
      (adapter.capabilities.recovery === "code" &&
        (!isEmail(normalizeEmail(value.email)) ||
          !/^\d{4,12}$/.test(value.code)))
    )
      return invalid("invalid-input", "reset");
    if (!assessPassword(value.password, policy).valid)
      return invalid("weak-password", "reset");
    const reset = adapter.resetPassword.bind(adapter);
    return operate("reset", () =>
      reset({ ...value, email: normalizeEmail(value.email) }),
    );
  }
  function resendVerification(value: string) {
    if (!methods.verification || !adapter.resendVerification)
      return invalid("unsupported", "resend");
    const email = normalizeEmail(value);
    if (!isEmail(email)) return invalid("invalid-input", "resend");
    const resend = adapter.resendVerification.bind(adapter);
    return operate("resend", () => resend(email));
  }
  function verifyEmail(value: { email: string; code: string }) {
    if (!methods.verification || !adapter.verifyEmail)
      return invalid("unsupported", "verify");
    const email = normalizeEmail(value.email);
    if (!isEmail(email) || !/^\d{4,12}$/.test(value.code))
      return invalid("invalid-input", "verify");
    const verify = adapter.verifyEmail.bind(adapter);
    return operate("verify", () => verify({ email, code: value.code }));
  }
  return {
    methods,
    policy,
    capabilities: adapter.capabilities,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    refresh,
    signIn,
    signUp,
    signInWithProvider,
    requestPasswordReset,
    resetPassword,
    resendVerification,
    verifyEmail,
    signOut: () => operate("sign-out", () => adapter.signOut()),
    clearFeedback() {
      if (
        snapshot.operation.phase !== "pending" &&
        snapshot.operation.phase !== "redirecting"
      )
        set({ operation: idle });
    },
    /** Popup cancelled or browser navigation did not happen; recheck the actual session. */
    async cancelRedirect() {
      operationVersion++;
      set({ operation: idle });
      await refresh();
    },
  };
}
export type AuthController = ReturnType<typeof createAuthController>;
