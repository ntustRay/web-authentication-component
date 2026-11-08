/** Public presentation state never contains access tokens, passwords or reset codes. */
export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly emailVerified: boolean;
}
export interface AuthSession {
  readonly user: AuthUser;
  readonly expiresAt: number | null;
}
export type Delivery = "link" | "code";
export type AuthErrorCode =
  | "invalid-input"
  | "invalid-credentials"
  | "verification-required"
  | "rate-limited"
  | "unavailable"
  | "unsupported"
  | "expired"
  | "weak-password"
  | "cancelled"
  | "timeout"
  | "unknown";
export interface AuthError {
  readonly code: AuthErrorCode;
  readonly retryAfterSeconds: number | null;
}
export type AuthOutcome =
  | { kind: "authenticated"; session: AuthSession }
  | { kind: "verification-required"; delivery: Delivery }
  | { kind: "sent"; delivery: Delivery }
  | { kind: "redirecting" }
  | { kind: "complete" };
export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuthError };
export interface PasswordCredentials {
  email: string;
  password: string;
}
export interface Registration extends PasswordCredentials {
  name: string;
}
export interface PasswordReset {
  email: string;
  password: string;
  code: string;
  token: string;
}
export interface EmailVerification {
  email: string;
  code: string;
}
export interface AuthCapabilities {
  readonly password: boolean;
  readonly registration: boolean;
  readonly recovery: Delivery | false;
  readonly verification: Delivery | false;
  readonly providers: readonly string[];
}
/** Implement this port to use any identity service. Methods must verify with its server. */
export interface AuthAdapter {
  readonly id: string;
  readonly capabilities: AuthCapabilities;
  getSession(): Promise<AuthResult<AuthSession | null>>;
  signOut(): Promise<AuthResult<AuthOutcome>>;
  subscribe?(listener: () => void): () => void;
  signIn?(input: PasswordCredentials): Promise<AuthResult<AuthOutcome>>;
  signUp?(input: Registration): Promise<AuthResult<AuthOutcome>>;
  signInWithProvider?(provider: string): Promise<AuthResult<AuthOutcome>>;
  requestPasswordReset?(email: string): Promise<AuthResult<AuthOutcome>>;
  resetPassword?(input: PasswordReset): Promise<AuthResult<AuthOutcome>>;
  resendVerification?(email: string): Promise<AuthResult<AuthOutcome>>;
  verifyEmail?(input: EmailVerification): Promise<AuthResult<AuthOutcome>>;
}
export interface Provider {
  readonly id: string;
  readonly label: string;
}
export interface AuthMethods {
  readonly password: boolean;
  readonly registration: boolean;
  readonly recovery: boolean;
  readonly verification: boolean;
  readonly providers: readonly Provider[];
}
export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
  readonly maxUtf8Bytes: number | null;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireNumber: boolean;
  readonly requireSymbol: boolean;
  readonly blocklist: readonly string[];
}
export type PasswordIssue =
  | "too-short"
  | "too-long"
  | "too-many-bytes"
  | "uppercase"
  | "lowercase"
  | "number"
  | "symbol"
  | "blocked";
export interface PasswordAssessment {
  valid: boolean;
  issues: readonly PasswordIssue[];
}
export type AuthAction =
  | "sign-in"
  | "sign-up"
  | "provider"
  | "forgot"
  | "reset"
  | "resend"
  | "verify"
  | "sign-out";
export interface AuthOperation {
  readonly id: number;
  readonly phase:
    | "idle"
    | "pending"
    | "settling"
    | "redirecting"
    | "success"
    | "error";
  readonly action: AuthAction | null;
  readonly outcome: AuthOutcome["kind"] | null;
  readonly error: AuthError | null;
}
export interface AuthSnapshot {
  readonly status: "checking" | "anonymous" | "authenticated" | "unavailable";
  readonly session: AuthSession | null;
  readonly operation: AuthOperation;
  readonly cooldownUntil: number;
}
export interface AuthRefreshOptions {
  /** Automatic focus/visibility/SDK reads must not restore a failed sign-out identity. */
  readonly background?: boolean;
}
/** Safe to send to analytics: intentionally excludes user IDs, email and request inputs. */
export interface AuthEvent {
  type: "started" | "succeeded" | "failed";
  action: AuthAction;
  errorCode: AuthErrorCode | null;
}
export interface AuthConfig {
  adapter: AuthAdapter;
  methods: AuthMethods;
  passwordPolicy?: Partial<PasswordPolicy>;
  requireVerifiedEmail?: boolean;
  cooldownSeconds?: number;
  timeoutMs?: number;
  onEvent?: (event: AuthEvent) => void;
}
