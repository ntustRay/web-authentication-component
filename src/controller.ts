import {
  publicFailure,
  publicOutcome,
  publicSessionResult,
} from "./boundary.js";
import { MAX_TIMER_DELAY_MS, validateConfig } from "./config.js";
import { capture, failure, success } from "./errors.js";
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
  AuthOperation,
  AuthOutcome,
  AuthRefreshOptions,
  AuthResult,
  AuthSession,
  AuthSnapshot,
  PasswordCredentials,
  PasswordReset,
  Registration,
} from "./types.js";

const idle: AuthOperation = Object.freeze({
  id: 0,
  phase: "idle",
  action: null,
  outcome: null,
  error: null,
});
const initial: AuthSnapshot = Object.freeze({
  status: "checking",
  session: null,
  operation: idle,
  cooldownUntil: 0,
});
interface Mutation {
  id: number;
  action: AuthAction;
  life: number;
  eventVersion: number;
  userId: string | null;
  timedOut: boolean;
  cancelled: boolean;
  published: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  result: Promise<AuthResult<AuthOutcome>>;
  resolve: (result: AuthResult<AuthOutcome>) => void;
}

export function createAuthController(input: AuthConfig) {
  validateConfig(input);
  const { adapter } = input;
  const config = {
    timeoutMs: input.timeoutMs ?? 30_000,
    cooldownSeconds: input.cooldownSeconds ?? 60,
    requireVerifiedEmail: input.requireVerifiedEmail ?? true,
    onEvent: input.onEvent,
  };
  const methods = Object.freeze({
    password: input.methods.password,
    registration: input.methods.registration,
    recovery: input.methods.recovery,
    verification: input.methods.verification,
    providers: Object.freeze(
      input.methods.providers.map((provider) =>
        Object.freeze({ id: provider.id, label: provider.label }),
      ),
    ),
  });
  const capabilities = Object.freeze({
    password: adapter.capabilities.password,
    registration: adapter.capabilities.registration,
    recovery: adapter.capabilities.recovery,
    verification: adapter.capabilities.verification,
    providers: Object.freeze([...adapter.capabilities.providers]),
  });
  const policy = resolvePasswordPolicy(input.passwordPolicy);
  const listeners = new Set<() => void>();
  let snapshot = initial;
  let operationVersion = 0;
  let identityVersion = 0;
  let refreshVersion = 0;
  let lifecycle = 0;
  let consumers = 0;
  let rateLimitUntil = 0;
  let unsubscribe: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshRequested = false;
  let pendingMutations = 0;
  let pendingReads = 0;
  let mutationTail: Promise<void> = Promise.resolve();
  let latest: Mutation | null = null;
  let hiddenSignOut: { userId: string | null } | null = null;
  const readCancels = new Set<() => void>();

  function accepted(session: AuthSession): boolean {
    return (
      (!config.requireVerifiedEmail || session.user.emailVerified) &&
      (session.expiresAt === null || session.expiresAt > Date.now())
    );
  }
  function scheduleExpiry() {
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = null;
    const deadline = snapshot.session?.expiresAt;
    if (consumers === 0 || deadline === null || deadline === undefined) return;
    const life = lifecycle;
    expiryTimer = setTimeout(
      () => {
        expiryTimer = null;
        if (life !== lifecycle || consumers === 0) return;
        if (deadline > Date.now()) {
          scheduleExpiry();
          return;
        }
        set({ status: "checking", session: null });
        void refresh({ background: true });
      },
      Math.min(MAX_TIMER_DELAY_MS, Math.max(0, deadline - Date.now())),
    );
  }
  function set(patch: Partial<AuthSnapshot>) {
    snapshot = Object.freeze({
      ...snapshot,
      ...patch,
      operation: Object.freeze(patch.operation ?? snapshot.operation),
    });
    scheduleExpiry();
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* A consumer must not interrupt the authentication state machine. */
      }
    }
  }
  function emit(event: AuthEvent) {
    try {
      config.onEvent?.(Object.freeze(event));
    } catch {
      /* Telemetry cannot change authentication results. */
    }
  }
  function current(token: Mutation) {
    return (
      token.id === operationVersion &&
      token.life === lifecycle &&
      !token.cancelled
    );
  }
  function operation(
    token: Mutation,
    phase: AuthOperation["phase"],
    error: AuthOperation["error"] = null,
    outcome: AuthOperation["outcome"] = null,
  ): AuthOperation {
    return { id: token.id, phase, action: token.action, error, outcome };
  }
  function applySession(session: AuthSession | null, showProblem = false) {
    if (
      session &&
      hiddenSignOut &&
      (hiddenSignOut.userId === null ||
        session.user.id === hiddenSignOut.userId)
    ) {
      set({
        status: pendingMutations > 0 ? "checking" : "unavailable",
        session: null,
      });
      return;
    }
    if (session === null) hiddenSignOut = null;
    const valid = session && accepted(session);
    set({
      status: valid ? "authenticated" : "anonymous",
      session: valid ? session : null,
    });
    if (session && !valid && showProblem) {
      const error = publicFailure({
        code: session.user.emailVerified ? "expired" : "verification-required",
        retryAfterSeconds: null,
      });
      if (!error.ok)
        set({ operation: { ...idle, error: error.error, phase: "error" } });
    }
  }
  async function readSession(): Promise<AuthResult<AuthSession | null>> {
    pendingReads++;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancel = () => {};
    const timeout = new Promise<AuthResult<AuthSession | null>>((resolve) => {
      cancel = () => resolve(failure("cancelled"));
      readCancels.add(cancel);
      timer = setTimeout(() => resolve(failure("timeout")), config.timeoutMs);
    });
    try {
      const result = await Promise.race([
        capture(() => adapter.getSession()),
        timeout,
      ]);
      return publicSessionResult(result);
    } finally {
      pendingReads--;
      if (timer !== null) clearTimeout(timer);
      readCancels.delete(cancel);
    }
  }
  function scheduleRefresh() {
    refreshRequested = true;
    if (pendingMutations > 0 || consumers === 0) return;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    const life = lifecycle;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (life === lifecycle && consumers > 0)
        void refresh({ background: true });
    }, 0);
  }
  async function refresh(options: AuthRefreshOptions = {}): Promise<void> {
    // Hidden tabs can throttle expiry timers. Hide expired UI before an awaited read.
    if (
      snapshot.session?.expiresAt !== null &&
      snapshot.session?.expiresAt !== undefined &&
      snapshot.session.expiresAt <= Date.now()
    )
      set({ status: "checking", session: null });
    if (pendingMutations > 0) {
      refreshRequested = true;
      return;
    }
    if (!options.background) hiddenSignOut = null;
    refreshRequested = false;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = null;
    const request = ++refreshVersion;
    const identity = identityVersion;
    const life = lifecycle;
    if (snapshot.status === "unavailable")
      set({ status: "checking", session: null });
    const result = await readSession();
    if (
      request !== refreshVersion ||
      identity !== identityVersion ||
      life !== lifecycle ||
      pendingMutations > 0
    )
      return;
    if (!result.ok) {
      set({ status: "unavailable", session: null });
      return;
    }
    applySession(result.value, true);
  }
  function sessionChanged() {
    ++identityVersion;
    ++refreshVersion;
    set({ status: "checking", session: null });
    // Defer beyond SDK callbacks/locks. Never read an old session during a mutation.
    scheduleRefresh();
  }
  function publish(token: Mutation, result: AuthResult<AuthOutcome>) {
    if (token.timer !== null) clearTimeout(token.timer);
    token.timer = null;
    if (token.published) return;
    token.published = true;
    emit({
      type: result.ok ? "succeeded" : "failed",
      action: token.action,
      errorCode: result.ok ? null : result.error.code,
    });
    token.resolve(result);
  }
  function start(): () => void {
    consumers++;
    if (consumers === 1) {
      const life = lifecycle;
      try {
        unsubscribe =
          adapter.subscribe?.(() => {
            if (life === lifecycle && consumers > 0) sessionChanged();
          }) ?? null;
      } catch {
        set({ status: "unavailable", session: null });
      }
      scheduleExpiry();
      void refresh({ background: true });
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      consumers--;
      if (consumers !== 0) return;
      lifecycle++;
      refreshVersion++;
      operationVersion++;
      try {
        unsubscribe?.();
      } catch {
        /* Always finish cleanup if provider unsubscribe fails. */
      }
      unsubscribe = null;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = null;
      if (expiryTimer !== null) clearTimeout(expiryTimer);
      expiryTimer = null;
      for (const cancel of readCancels) cancel();
      if (latest) {
        latest.cancelled = true;
        publish(latest, failure("cancelled"));
      }
      // Unmount cannot cancel an SDK request. Retain its barrier until it settles.
      set({
        status: "checking",
        session: null,
        operation:
          pendingMutations > 0 && latest ? operation(latest, "settling") : idle,
      });
    };
  }
  async function reconcile(
    token: Mutation,
    result: AuthResult<AuthOutcome>,
  ): Promise<AuthResult<AuthOutcome>> {
    if (!current(token) || token.timedOut)
      return failure(token.timedOut ? "timeout" : "cancelled");
    if (identityVersion !== token.eventVersion) {
      let identity = identityVersion;
      let verified = await readSession();
      if (identity !== identityVersion && current(token)) {
        identity = identityVersion;
        verified = await readSession();
      }
      if (!current(token) || token.timedOut || identity !== identityVersion)
        return failure(token.timedOut ? "timeout" : "cancelled");
      if (!verified.ok) return verified;
      const actual = verified.value;
      applySession(actual);
      refreshRequested = false;
      if (token.action === "sign-out" && actual && accepted(actual))
        return failure(
          token.userId !== null && actual.user.id !== token.userId
            ? "cancelled"
            : "unavailable",
        );
      if (result.ok) {
        if (result.value.kind === "authenticated") {
          if (
            !actual ||
            !accepted(actual) ||
            actual.user.id !== result.value.session.user.id
          )
            return failure("cancelled");
          result = success({ kind: "authenticated", session: actual });
        } else if (
          actual &&
          accepted(actual) &&
          (token.action === "sign-out" ||
            token.action === "reset" ||
            actual.user.id !== token.userId)
        )
          return failure("cancelled");
      }
    }
    if (
      result.ok &&
      result.value.kind === "authenticated" &&
      !accepted(result.value.session)
    ) {
      if (
        token.action === "sign-up" &&
        !result.value.session.user.emailVerified &&
        capabilities.verification
      )
        return success({
          kind: "verification-required",
          delivery: capabilities.verification,
        });
      return failure(
        result.value.session.user.emailVerified
          ? "expired"
          : "verification-required",
      );
    }
    return publicOutcome(result);
  }
  function finishState(token: Mutation, result: AuthResult<AuthOutcome>) {
    if (!current(token) || token.timedOut) return;
    if (!result.ok) {
      if (
        token.userId !== null &&
        snapshot.session === null &&
        token.action !== "sign-out"
      )
        refreshRequested = true;
      if (result.error.code === "rate-limited")
        rateLimitUntil =
          Date.now() + (result.error.retryAfterSeconds ?? 60) * 1000;
      set({
        operation: operation(token, "error", result.error),
        cooldownUntil: Math.max(snapshot.cooldownUntil, rateLimitUntil),
      });
      if (
        result.error.code === "timeout" ||
        (token.action === "sign-out" && result.error.code !== "cancelled")
      )
        set({ status: "unavailable", session: null });
      else if (snapshot.status === "checking")
        set({ status: "anonymous", session: null });
      return;
    }
    const outcome = result.value;
    if (
      token.userId !== null &&
      snapshot.session === null &&
      token.action !== "sign-out" &&
      token.action !== "reset" &&
      outcome.kind !== "authenticated" &&
      outcome.kind !== "redirecting"
    )
      refreshRequested = true;
    if (outcome.kind === "authenticated") {
      hiddenSignOut = null;
      applySession(outcome.session);
    } else if (snapshot.status === "checking")
      set({ status: "anonymous", session: null });
    if (
      token.action === "sign-out" ||
      (token.action === "reset" && outcome.kind === "complete")
    )
      set({ status: "anonymous", session: null });
    if (
      token.action === "forgot" ||
      token.action === "resend" ||
      (token.action === "sign-up" && outcome.kind === "verification-required")
    )
      set({ cooldownUntil: Date.now() + config.cooldownSeconds * 1000 });
    set({
      operation: operation(
        token,
        outcome.kind === "redirecting" ? "redirecting" : "success",
        null,
        outcome.kind,
      ),
    });
  }
  function operate(
    action: AuthAction,
    work: () => Promise<AuthResult<AuthOutcome>>,
  ): Promise<AuthResult<AuthOutcome>> {
    if (
      action === "sign-out" &&
      latest?.action === "sign-out" &&
      pendingMutations > 0
    )
      return latest.result;
    if (
      action !== "sign-out" &&
      (pendingMutations > 0 || snapshot.operation.phase === "redirecting")
    )
      return Promise.resolve(failure("cancelled"));
    const remaining = Math.ceil((rateLimitUntil - Date.now()) / 1000);
    if (remaining > 0 && action !== "sign-out")
      return invalid("rate-limited", action, remaining);
    if (
      (action === "forgot" || action === "resend") &&
      snapshot.cooldownUntil > Date.now()
    )
      return invalid(
        "rate-limited",
        action,
        Math.ceil((snapshot.cooldownUntil - Date.now()) / 1000),
      );
    let resolve = (_result: AuthResult<AuthOutcome>) => {};
    const result = new Promise<AuthResult<AuthOutcome>>((done) => {
      resolve = done;
    });
    const previous = latest;
    const token: Mutation = {
      id: ++operationVersion,
      action,
      life: lifecycle,
      eventVersion: identityVersion,
      userId: snapshot.session?.user.id ?? null,
      cancelled: false,
      timedOut: false,
      published: false,
      timer: null,
      result,
      resolve,
    };
    const queued = pendingMutations > 0;
    const predecessor = mutationTail;
    let release = () => {};
    mutationTail = new Promise<void>((done) => {
      release = done;
    });
    pendingMutations++;
    latest = token;
    if (action === "sign-out") hiddenSignOut = { userId: token.userId };
    if (pendingReads > 0 && action !== "sign-out" && action !== "reset")
      refreshRequested = true;
    refreshVersion++;
    if (
      [
        "sign-in",
        "sign-up",
        "provider",
        "verify",
        "reset",
        "sign-out",
      ].includes(action)
    )
      set({ status: "checking", session: null });
    if (action === "sign-out" && previous && queued) {
      previous.cancelled = true;
      publish(previous, failure("cancelled"));
    }
    set({ operation: operation(token, "pending") });
    emit({ type: "started", action, errorCode: null });
    token.timer = setTimeout(() => {
      if (!current(token) || token.published) return;
      token.timedOut = true;
      const timeout = publicFailure({
        code: "timeout",
        retryAfterSeconds: null,
      });
      if (!timeout.ok)
        set({
          status: "unavailable",
          session: null,
          operation: operation(token, "settling", timeout.error),
        });
      publish(token, timeout);
    }, config.timeoutMs);
    async function execute() {
      let settled: AuthResult<AuthOutcome> = failure("cancelled");
      try {
        if (!token.cancelled || token.action === "sign-out") {
          const completed = publicOutcome(await capture(work));
          settled = publicOutcome(await reconcile(token, completed));
          if (
            token.action === "sign-out" &&
            completed.ok &&
            completed.value.kind === "complete" &&
            (settled.ok || token.timedOut || token.life !== lifecycle)
          )
            hiddenSignOut = null;
        }
        if (
          settled.ok &&
          settled.value.kind === "authenticated" &&
          !accepted(settled.value.session)
        )
          settled = publicFailure({ code: "expired", retryAfterSeconds: null });
        finishState(token, settled);
      } catch {
        settled = publicFailure({
          code: "unavailable",
          retryAfterSeconds: null,
        });
        finishState(token, settled);
      } finally {
        pendingMutations--;
        release();
        if (latest === token) {
          latest = null;
          if (token.timedOut && token.life === lifecycle) {
            const timeout = publicFailure({
              code: "timeout",
              retryAfterSeconds: null,
            });
            if (!timeout.ok)
              set({ operation: operation(token, "error", timeout.error) });
          } else if (token.life !== lifecycle && pendingMutations === 0)
            set({ operation: idle });
        }
        publish(token, current(token) ? settled : failure("cancelled"));
        if (
          pendingMutations === 0 &&
          (refreshRequested || token.timedOut || token.life !== lifecycle)
        )
          scheduleRefresh();
      }
    }
    if (queued) void predecessor.then(execute);
    else void execute();
    return result;
  }
  function invalid(
    code: "invalid-input" | "weak-password" | "unsupported" | "rate-limited",
    action: AuthAction,
    retryAfterSeconds: number | null = null,
  ): Promise<AuthResult<AuthOutcome>> {
    if (pendingMutations > 0 || snapshot.operation.phase === "redirecting")
      return Promise.resolve(failure("cancelled"));
    const result = publicFailure({ code, retryAfterSeconds });
    if (!result.ok)
      set({
        operation: {
          id: ++operationVersion,
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
      signUp({
        email,
        name: registration.name.trim(),
        password: registration.password,
      }),
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
      (capabilities.recovery === "code" &&
        (!isEmail(normalizeEmail(value.email)) ||
          !/^\d{4,12}$/.test(value.code)))
    )
      return invalid("invalid-input", "reset");
    if (!assessPassword(value.password, policy).valid)
      return invalid("weak-password", "reset");
    const reset = adapter.resetPassword.bind(adapter);
    return operate("reset", () =>
      reset({
        email: normalizeEmail(value.email),
        password: value.password,
        code: value.code,
        token: value.token,
      }),
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
    capabilities,
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
      if (pendingMutations === 0 && snapshot.operation.phase !== "redirecting")
        set({ operation: idle });
    },
    async cancelRedirect() {
      if (pendingMutations > 0 || snapshot.operation.phase !== "redirecting")
        return;
      operationVersion++;
      set({ operation: idle });
      await refresh({ background: true });
    },
  };
}
export type AuthController = ReturnType<typeof createAuthController>;
