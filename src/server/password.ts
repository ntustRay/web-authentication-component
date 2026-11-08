import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AuthFailure } from "../errors.js";
import { assessPassword, resolvePasswordPolicy } from "../password.js";
import type { PasswordPolicy } from "../types.js";

const params = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const maxInputBytes = 16_384;
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, params, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export interface ServerPasswordOptions {
  policy?: Partial<PasswordPolicy>;
  /** Implement on the server using your identity provider or a local breach corpus. Never log this input. */
  isCompromised?: (password: string) => Promise<boolean>;
}
export async function validateNewPassword(
  password: string,
  options: ServerPasswordOptions = {},
): Promise<void> {
  if (!assessPassword(password, resolvePasswordPolicy(options.policy)).valid)
    throw new AuthFailure("weak-password");
  if (options.isCompromised) {
    let compromised: boolean;
    try {
      compromised = await options.isCompromised(password);
    } catch {
      throw new AuthFailure("unavailable");
    }
    if (compromised) throw new AuthFailure("weak-password");
  }
}
/** Only for custom backends. With Supabase/Better Auth/Neon, let that service own password hashing. */
export async function hashPassword(
  password: string,
  options: ServerPasswordOptions = {},
): Promise<string> {
  await validateNewPassword(password, options);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > maxInputBytes) return false;
  const fields = encoded.split("$");
  const [algorithm, cost, blockSize, parallel, saltText, keyText] = fields;
  // Do not execute attacker-controlled cost parameters or accept truncated encodings.
  if (
    fields.length !== 6 ||
    algorithm !== "scrypt" ||
    cost !== "131072" ||
    blockSize !== "8" ||
    parallel !== "1" ||
    !saltText ||
    !keyText ||
    !/^[A-Za-z0-9_-]{22}$/.test(saltText) ||
    !/^[A-Za-z0-9_-]{86}$/.test(keyText)
  )
    return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  if (
    salt.length !== 16 ||
    expected.length !== 64 ||
    salt.toString("base64url") !== saltText ||
    expected.toString("base64url") !== keyText
  )
    return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
