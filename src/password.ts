import type {
  PasswordAssessment,
  PasswordIssue,
  PasswordPolicy,
} from "./types.js";
/** Small offline starter list, NOT a complete breached-password database. Supply a server check. */
export const defaultPasswordPolicy: Readonly<PasswordPolicy> = Object.freeze({
  minLength: 8,
  maxLength: 128,
  maxUtf8Bytes: null,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
  blocklist: Object.freeze([
    "password",
    "12345678",
    "123456789",
    "1234567890",
    "qwertyuiop",
    "qwerty123",
    "letmein123",
    "password123",
    "password123456789",
    "123456789012345",
    "qwertyuiopasdfgh",
    "letmein",
    "administrator",
  ]),
});
export function resolvePasswordPolicy(
  overrides: Partial<PasswordPolicy> = {},
): PasswordPolicy {
  const policy = {
    ...defaultPasswordPolicy,
    ...overrides,
    blocklist: Object.freeze([
      ...(overrides.blocklist ?? defaultPasswordPolicy.blocklist),
    ]),
  };
  if (
    !Number.isInteger(policy.minLength) ||
    !Number.isInteger(policy.maxLength) ||
    policy.minLength < 1 ||
    policy.maxLength < policy.minLength ||
    policy.maxLength > 4096
  )
    throw new Error("Invalid password length policy");
  if (
    policy.maxUtf8Bytes !== null &&
    (!Number.isInteger(policy.maxUtf8Bytes) || policy.maxUtf8Bytes < 1)
  )
    throw new Error("Invalid password byte limit");
  return Object.freeze(policy);
}
export function assessPassword(
  password: string,
  policy: PasswordPolicy = defaultPasswordPolicy,
): PasswordAssessment {
  const issues: PasswordIssue[] = [];
  // A code point occupies at most two UTF-16 code units. Reject oversized
  // inputs without allocating a code-point array for an entire request body.
  const length =
    password.length > policy.maxLength * 2
      ? password.length
      : Array.from(password).length;
  if (length < policy.minLength) issues.push("too-short");
  if (length > policy.maxLength) issues.push("too-long");
  if (
    policy.maxUtf8Bytes !== null &&
    new TextEncoder().encode(password).length > policy.maxUtf8Bytes
  )
    issues.push("too-many-bytes");
  if (policy.requireUppercase && !/\p{Lu}/u.test(password))
    issues.push("uppercase");
  if (policy.requireLowercase && !/\p{Ll}/u.test(password))
    issues.push("lowercase");
  if (policy.requireNumber && !/\p{N}/u.test(password)) issues.push("number");
  if (policy.requireSymbol && !/[^\p{L}\p{N}\s]/u.test(password))
    issues.push("symbol");
  const folded = password.toLowerCase();
  if (policy.blocklist.some((entry) => entry.toLowerCase() === folded))
    issues.push("blocked");
  return { valid: issues.length === 0, issues };
}
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
