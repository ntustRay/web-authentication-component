/** Public presentation state never contains access tokens, passwords or reset codes. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}
export interface AuthSession {
  user: AuthUser;
  expiresAt: number | null;
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
  code: AuthErrorCode;
  retryAfterSeconds: number | null;
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
  password: boolean;
  registration: boolean;
  recovery: Delivery | false;
  verification: Delivery | false;
  providers: readonly string[];
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
  id: string;
  label: string;
}
export interface AuthMethods {
  password: boolean;
  registration: boolean;
  recovery: boolean;
  verification: boolean;
  providers: readonly Provider[];
}
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  maxUtf8Bytes: number | null;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  blocklist: readonly string[];
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
  phase: "idle" | "pending" | "redirecting" | "success" | "error";
  action: AuthAction | null;
  outcome: AuthOutcome["kind"] | null;
  error: AuthError | null;
}
export interface AuthSnapshot {
  status: "checking" | "anonymous" | "authenticated" | "unavailable";
  session: AuthSession | null;
  operation: AuthOperation;
  cooldownUntil: number;
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
