"use client";
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useAuth } from "./context.js";
import { type AuthMessages, zhTW } from "./messages.js";
export function LoadingIcon({ className = "" }: { className?: string }) {
  return <span className={`mra-spinner ${className}`} aria-hidden="true" />;
}
export function AuthButton({
  pending = false,
  loadingIcon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  loadingIcon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? (loadingIcon ?? <LoadingIcon />) : null}
      {children}
    </button>
  );
}
export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}
export function AuthField({ label, error, hint, ...input }: AuthFieldProps) {
  const generated = useId();
  const id = input.id ?? generated;
  const description = [
    error ? `${id}-error` : null,
    hint ? `${id}-hint` : null,
    input["aria-describedby"],
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="mra-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        id={id}
        aria-invalid={!!error}
        aria-describedby={description || undefined}
      />
      {hint && (
        <div id={`${id}-hint`} className="mra-hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="mra-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function PasswordField({
  label,
  error,
  hint,
  messages = zhTW,
  ...input
}: AuthFieldProps & { messages?: AuthMessages }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const described = [
    input["aria-describedby"],
    error ? `${id}-error` : null,
    caps ? `${id}-caps` : null,
    hint ? `${id}-hint` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="mra-field">
      <label htmlFor={id}>{label}</label>
      <div className="mra-password">
        <input
          {...input}
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={described || undefined}
          onKeyUp={(event) => {
            setCaps(event.getModifierState("CapsLock"));
            input.onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCaps(false);
            input.onBlur?.(event);
          }}
        />
        <button
          type="button"
          className="mra-reveal"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? messages.hidePassword : messages.showPassword}
          aria-pressed={visible}
          disabled={input.disabled || input.readOnly}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9 5.4a11 11 0 0 1 3-.4c6 0 10 7 10 7a20 20 0 0 1-4 4.5M6.5 6.5A22 22 0 0 0 2 12s4 7 10 7a11 11 0 0 0 4-.8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && (
        <div id={`${id}-hint`} className="mra-hint">
          {hint}
        </div>
      )}
      {caps && (
        <p id={`${id}-caps`} className="mra-hint">
          {messages.capsLock}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mra-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function AuthFeedback({
  tone,
  children,
  focus = false,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
  focus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      tabIndex={-1}
      className="mra-feedback"
      data-tone={tone}
    >
      {children}
    </div>
  );
}
export function SignOutButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const auth = useAuth();
  const pending =
    auth.state.operation.action === "sign-out" &&
    auth.state.operation.phase === "pending";
  return (
    <AuthButton
      {...props}
      pending={pending}
      onClick={() => {
        void auth.signOut();
      }}
    >
      {children ?? zhTW.signOut}
    </AuthButton>
  );
}
export function AuthStatus({
  messages = zhTW,
  className = "",
  children,
}: {
  messages?: AuthMessages;
  className?: string;
  children?: ReactNode;
}) {
  const auth = useAuth();
  const { state } = auth;
  if (state.status === "checking")
    return (
      <div className={`mra-status ${className}`} role="status">
        <LoadingIcon />
        {messages.checking}
      </div>
    );
  if (state.status === "unavailable")
    return (
      <div className={`mra-status ${className}`}>
        <AuthFeedback tone="error">{messages.unavailable}</AuthFeedback>
        <button
          type="button"
          className="mra-button"
          onClick={() => {
            void auth.refresh();
          }}
        >
          {messages.retry}
        </button>
      </div>
    );
  return (
    <div className={`mra-status ${className}`} role="status">
      {state.session ? (
        <>
          <span>
            <strong>{messages.signedIn}</strong>
            <br />
            {state.session.user.name ??
              state.session.user.email ??
              state.session.user.id}
          </span>
          <SignOutButton className="mra-button mra-secondary">
            {messages.signOut}
          </SignOutButton>
        </>
      ) : (
        (children ?? messages.signedOut)
      )}
      {state.operation.error && state.operation.action === "sign-out" && (
        <AuthFeedback tone="error">
          {messages.errors[state.operation.error.code]}
        </AuthFeedback>
      )}
    </div>
  );
}
/** Presentation gate only. The application's server must independently enforce authorization. */
export function AuthGate({
  children,
  fallback = null,
  loading = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
}) {
  const { state } = useAuth();
  return (
    <>
      {state.status === "checking"
        ? loading
        : state.status === "authenticated"
          ? children
          : fallback}
    </>
  );
}
