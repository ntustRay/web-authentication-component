"use client";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { assessPassword, isEmail, normalizeEmail } from "../password.js";
import type { AuthOutcome, AuthResult } from "../types.js";
import { useAuth } from "./context.js";
import { type AuthMessages, en, formatMessage, zhTW } from "./messages.js";
import {
  AuthButton,
  AuthFeedback,
  AuthField,
  type AuthFieldProps,
  AuthStatus,
  PasswordField,
} from "./primitives.js";

export type AuthView =
  | "sign-in"
  | "sign-up"
  | "forgot-password"
  | "reset-password"
  | "verify-email"
  | "resend-verification";
export interface AuthSlots {
  header?: ReactNode;
  footer?: ReactNode;
  loadingIcon?: ReactNode;
  providerIcon?: (id: string) => ReactNode;
  field?: (
    props: AuthFieldProps & { secret: boolean; messages: AuthMessages },
  ) => ReactNode;
}
export interface AuthPanelProps {
  initialView?: AuthView;
  view?: AuthView;
  onViewChange?: (view: AuthView) => void;
  locale?: "zh-TW" | "en";
  messages?: Partial<AuthMessages>;
  slots?: AuthSlots;
  className?: string;
  theme?: "light" | "dark" | "auto";
  unstyled?: boolean;
  disabled?: boolean;
  notice?: { tone: "error" | "info" | "success"; message: string };
  /** Better Auth link tokens come from the host's validated callback route. Not persisted. */
  resetToken?: string;
}
function useSeconds(deadline: number) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    if (deadline <= Date.now()) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return seconds;
}
export function AuthPanel({
  initialView = "sign-in",
  view: controlled,
  onViewChange,
  locale = "zh-TW",
  messages: overrides,
  slots = {},
  className = "",
  theme = "auto",
  unstyled = false,
  disabled = false,
  notice,
  resetToken = "",
}: AuthPanelProps) {
  const auth = useAuth();
  const titleId = useId();
  const [localView, setLocalView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const view = controlled ?? localView;
  const messages = { ...(locale === "en" ? en : zhTW), ...overrides };
  function change(next: AuthView, keepMessage = false) {
    auth.clearFeedback();
    if (!keepMessage) setMessage("");
    setLocalView(next);
    onViewChange?.(next);
  }
  const titles: Record<AuthView, string> = {
    "sign-in": messages.signIn,
    "sign-up": messages.signUp,
    "forgot-password": messages.forgot,
    "reset-password": messages.reset,
    "verify-email": messages.verify,
    "resend-verification": messages.resend,
  };
  const allowed =
    view === "sign-in" ||
    (auth.methods.registration && view === "sign-up") ||
    (auth.methods.recovery &&
      (view === "forgot-password" || view === "reset-password")) ||
    (auth.methods.verification &&
      (view === "verify-email" || view === "resend-verification"));
  const busy =
    auth.state.operation.phase === "pending" ||
    auth.state.operation.phase === "redirecting";
  const pending = auth.state.operation.phase === "pending";
  const seconds = useSeconds(auth.state.cooldownUntil);
  const completedIdentity = useRef<string | null>(null);
  useEffect(() => {
    const identity = auth.state.session?.user.id ?? null;
    if (completedIdentity.current !== identity) {
      setMessage("");
      setEmail("");
    }
    completedIdentity.current = identity;
  }, [auth.state.session?.user.id]);
  function completed(result: AuthResult<AuthOutcome>, address: string) {
    setEmail(address);
    if (!result.ok) {
      if (
        result.error.code === "verification-required" &&
        auth.methods.verification
      )
        change("verify-email");
      return;
    }
    if (result.value.kind === "verification-required") {
      setMessage(messages.verificationSent);
      change("verify-email", true);
    } else if (result.value.kind === "sent") {
      setMessage(
        view === "forgot-password" ? messages.sent : messages.verificationSent,
      );
      if (view === "forgot-password" && auth.capabilities.recovery === "code")
        change("reset-password", true);
    } else if (result.value.kind === "complete") {
      setMessage(
        view === "reset-password"
          ? messages.passwordUpdated
          : messages.verified,
      );
      change("sign-in", true);
    }
  }
  return (
    <section
      className={`${unstyled ? "" : "mra-root"} ${className}`}
      data-theme={theme}
      aria-labelledby={titleId}
    >
      {slots.header}
      <h2 id={titleId} className="mra-title">
        {auth.state.status === "authenticated" && view !== "reset-password"
          ? messages.signedIn
          : titles[view]}
      </h2>
      {auth.state.status === "authenticated" && view !== "reset-password" ? (
        <AuthStatus messages={messages} />
      ) : (
        <>
          {notice && (
            <AuthFeedback tone={notice.tone}>{notice.message}</AuthFeedback>
          )}
          {message && (
            <AuthFeedback tone="success" focus>
              {message}
            </AuthFeedback>
          )}
          {auth.state.operation.error && (
            <AuthFeedback tone="error" focus>
              {messages.errors[auth.state.operation.error.code]}
            </AuthFeedback>
          )}
          {auth.state.status === "unavailable" && (
            <div className="mra-stack">
              <AuthFeedback tone="info">{messages.unavailable}</AuthFeedback>
              <button
                type="button"
                className="mra-link"
                onClick={() => {
                  void auth.refresh();
                }}
              >
                {messages.retry}
              </button>
            </div>
          )}
          {!allowed ? (
            <AuthFeedback tone="error">
              {messages.errors.unsupported}
            </AuthFeedback>
          ) : (
            <>
              {view === "sign-in" && auth.methods.providers.length > 0 && (
                <div className="mra-providers">
                  {auth.methods.providers.map((provider) => (
                    <AuthButton
                      key={provider.id}
                      className="mra-button mra-secondary"
                      disabled={disabled || busy}
                      pending={
                        pending && auth.state.operation.action === "provider"
                      }
                      loadingIcon={slots.loadingIcon}
                      onClick={() => {
                        void auth.signInWithProvider(provider.id);
                      }}
                    >
                      {slots.providerIcon?.(provider.id)}
                      {formatMessage(messages.provider, {
                        provider: provider.label,
                      })}
                    </AuthButton>
                  ))}
                </div>
              )}
              {view === "sign-in" &&
                auth.methods.password &&
                auth.methods.providers.length > 0 && (
                  <div className="mra-separator">{messages.separator}</div>
                )}
              {(view !== "sign-in" || auth.methods.password) && (
                <PanelForm
                  key={view}
                  view={view}
                  messages={messages}
                  slots={slots}
                  initialEmail={email}
                  onEmailChange={setEmail}
                  disabled={disabled || busy}
                  pending={pending}
                  seconds={seconds}
                  resetToken={resetToken}
                  onComplete={completed}
                />
              )}
              {view === "verify-email" &&
                auth.capabilities.verification === "code" && (
                  <AuthButton
                    className="mra-button mra-secondary"
                    disabled={
                      disabled || busy || seconds > 0 || !isEmail(email)
                    }
                    onClick={() => {
                      void auth
                        .resendVerification(email)
                        .then((result) => completed(result, email));
                    }}
                  >
                    {seconds > 0
                      ? formatMessage(messages.cooldown, { seconds })
                      : messages.resend}
                  </AuthButton>
                )}
            </>
          )}
          {auth.state.operation.phase === "redirecting" && (
            <div className="mra-stack">
              <AuthFeedback tone="info">{messages.redirected}</AuthFeedback>
              <p className="mra-hint">{messages.redirectHelp}</p>
              <button
                type="button"
                className="mra-link"
                onClick={() => {
                  void auth.cancelRedirect();
                }}
              >
                {messages.cancelRedirect}
              </button>
            </div>
          )}
          <nav className="mra-links" aria-label={messages.other}>
            {view === "sign-in" ? (
              <>
                {auth.methods.registration && (
                  <button
                    type="button"
                    className="mra-link"
                    disabled={busy}
                    onClick={() => change("sign-up")}
                  >
                    {messages.signUp}
                  </button>
                )}
                {auth.methods.recovery && (
                  <button
                    type="button"
                    className="mra-link"
                    disabled={busy}
                    onClick={() => change("forgot-password")}
                  >
                    {messages.forgot}
                  </button>
                )}
                {auth.methods.verification && (
                  <button
                    type="button"
                    className="mra-link"
                    disabled={busy}
                    onClick={() => change("resend-verification")}
                  >
                    {messages.resend}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="mra-link"
                disabled={busy}
                onClick={() => change("sign-in")}
              >
                {messages.back}
              </button>
            )}
          </nav>
        </>
      )}
      {slots.footer}
    </section>
  );
}
function PanelForm({
  view,
  messages,
  slots,
  initialEmail,
  onEmailChange,
  disabled,
  pending,
  seconds,
  resetToken,
  onComplete,
}: {
  view: AuthView;
  messages: AuthMessages;
  slots: AuthSlots;
  initialEmail: string;
  onEmailChange: (email: string) => void;
  disabled: boolean;
  pending: boolean;
  seconds: number;
  resetToken: string;
  onComplete: (result: AuthResult<AuthOutcome>, email: string) => void;
}) {
  const auth = useAuth();
  const policyId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const newPassword = view === "sign-up" || view === "reset-password";
  const hasPassword = view === "sign-in" || newPassword;
  const codeFlow =
    (view === "verify-email" && auth.capabilities.verification === "code") ||
    (view === "reset-password" && auth.capabilities.recovery === "code");
  const emailField = !(view === "reset-password" && !codeFlow);
  const linkVerification =
    view === "verify-email" && auth.capabilities.verification === "link";
  const assessment = assessPassword(password, auth.policy);
  const emailError =
    submitted && emailField && !isEmail(normalizeEmail(email))
      ? messages.invalidEmail
      : null;
  const passwordError =
    submitted && newPassword && !assessment.valid
      ? assessment.issues.map((issue) => messages.issues[issue]).join("；")
      : null;
  const confirmationError =
    submitted && newPassword && password !== confirmation
      ? messages.mismatch
      : null;
  function render(props: AuthFieldProps, secret = false) {
    return slots.field ? (
      slots.field({ ...props, secret, messages })
    ) : secret ? (
      <PasswordField {...props} messages={messages} />
    ) : (
      <AuthField {...props} />
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    setSubmitted(true);
    if (
      (emailField && !isEmail(normalizeEmail(email))) ||
      (newPassword && (!assessment.valid || password !== confirmation))
    ) {
      queueMicrotask(() => {
        formRef.current
          ?.querySelector<HTMLInputElement>("[aria-invalid=true]")
          ?.focus();
      });
      return;
    }
    let result: AuthResult<AuthOutcome>;
    if (view === "sign-in") result = await auth.signIn({ email, password });
    else if (view === "sign-up")
      result = await auth.signUp({ email, password, name }, confirmation);
    else if (view === "forgot-password")
      result = await auth.requestPasswordReset(email);
    else if (view === "reset-password")
      result = await auth.resetPassword(
        { email, password, code, token: resetToken },
        confirmation,
      );
    else if (view === "verify-email" && !linkVerification)
      result = await auth.verifyEmail({ email, code });
    else result = await auth.resendVerification(email);
    if (result.ok) {
      setPassword("");
      setConfirmation("");
      setCode("");
    }
    onComplete(result, normalizeEmail(email));
  }
  const labels: Record<AuthView, string> = {
    "sign-in": messages.signIn,
    "sign-up": messages.signUp,
    "forgot-password": messages.forgot,
    "reset-password": messages.reset,
    "verify-email": linkVerification ? messages.resend : messages.verify,
    "resend-verification": messages.resend,
  };
  const mailAction =
    view === "forgot-password" ||
    view === "resend-verification" ||
    linkVerification;
  return (
    <form
      ref={formRef}
      className="mra-form"
      onSubmit={(event) => {
        void submit(event);
      }}
      aria-label={labels[view]}
      aria-busy={pending}
      noValidate
    >
      {emailField &&
        render({
          name: "email",
          label: messages.email,
          type: "email",
          autoComplete: view === "sign-in" ? "username" : "email",
          autoCapitalize: "none",
          spellCheck: false,
          required: true,
          value: email,
          onChange: (event) => {
            setEmail(event.target.value);
            onEmailChange(event.target.value);
          },
          readOnly: disabled,
          error: emailError,
        })}
      {view === "sign-up" &&
        render({
          name: "name",
          label: messages.name,
          autoComplete: "nickname",
          maxLength: 80,
          value: name,
          onChange: (event) => setName(event.target.value),
          readOnly: disabled,
        })}
      {codeFlow &&
        render({
          name: "code",
          label: messages.code,
          type: "text",
          autoComplete: "one-time-code",
          inputMode: "numeric",
          maxLength: 12,
          required: true,
          value: code,
          onChange: (event) => setCode(event.target.value),
          readOnly: disabled,
        })}
      {hasPassword &&
        render(
          {
            name: "password",
            label: messages.password,
            autoComplete: newPassword ? "new-password" : "current-password",
            required: true,
            value: password,
            onChange: (event) => setPassword(event.target.value),
            readOnly: disabled,
            error: passwordError,
            "aria-describedby": newPassword ? policyId : undefined,
          },
          true,
        )}
      {newPassword && (
        <>
          <div id={policyId} className="mra-policy">
            <p>{messages.policyTitle}</p>
            <ul>
              <li data-met={!assessment.issues.includes("too-short")}>
                {formatMessage(messages.passwordLength, {
                  min: auth.policy.minLength,
                })}
              </li>
              <li data-met={!assessment.issues.includes("too-long")}>
                {formatMessage(messages.passwordMax, {
                  max: auth.policy.maxLength,
                })}
              </li>
              {auth.policy.maxUtf8Bytes !== null && (
                <li data-met={!assessment.issues.includes("too-many-bytes")}>
                  {formatMessage(messages.byteLimit, {
                    bytes: auth.policy.maxUtf8Bytes,
                  })}
                </li>
              )}
              {(
                [
                  "uppercase",
                  "lowercase",
                  "number",
                  "symbol",
                  "blocked",
                ] satisfies import("../types.js").PasswordIssue[]
              )
                .filter(
                  (issue) =>
                    issue === "blocked" ||
                    (issue === "uppercase" && auth.policy.requireUppercase) ||
                    (issue === "lowercase" && auth.policy.requireLowercase) ||
                    (issue === "number" && auth.policy.requireNumber) ||
                    (issue === "symbol" && auth.policy.requireSymbol),
                )
                .map((issue) => (
                  <li
                    key={issue}
                    data-met={
                      password.length > 0 && !assessment.issues.includes(issue)
                    }
                  >
                    {messages.issues[issue]}
                  </li>
                ))}
            </ul>
          </div>
          {render(
            {
              name: "confirmPassword",
              label: messages.confirmation,
              autoComplete: "new-password",
              required: true,
              value: confirmation,
              onChange: (event) => setConfirmation(event.target.value),
              readOnly: disabled,
              error: confirmationError,
            },
            true,
          )}
        </>
      )}
      <AuthButton
        type="submit"
        className="mra-button mra-primary"
        pending={pending}
        disabled={disabled || (mailAction && seconds > 0)}
        loadingIcon={slots.loadingIcon}
      >
        {pending
          ? messages.waiting
          : mailAction && seconds > 0
            ? formatMessage(messages.cooldown, { seconds })
            : labels[view]}
      </AuthButton>
    </form>
  );
}
