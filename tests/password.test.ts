import { describe, expect, it } from "vitest";
import { assessPassword, resolvePasswordPolicy } from "../src/password.js";

describe("password policy", () => {
  it("supports passphrases without arbitrary character mixtures", () =>
    expect(assessPassword("quiet ocean lantern orbit").valid).toBe(true));
  it("counts code points and supports byte-limited backends", () => {
    expect(assessPassword("🪷".repeat(15)).valid).toBe(true);
    expect(
      assessPassword(
        "🪷".repeat(19),
        resolvePasswordPolicy({ maxUtf8Bytes: 72 }),
      ).issues,
    ).toContain("too-many-bytes");
  });
  it("supports opt-in complexity rules", () => {
    const policy = resolvePasswordPolicy({
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    });
    expect(assessPassword("quiet ocean lantern orbit", policy).issues).toEqual([
      "uppercase",
      "number",
      "symbol",
    ]);
    expect(assessPassword("Quiet ocean lantern 42!", policy).valid).toBe(true);
  });
  it("blocks common passwords and invalid configurations", () => {
    expect(assessPassword("password123456789").issues).toContain("blocked");
    expect(() =>
      resolvePasswordPolicy({ minLength: 20, maxLength: 10 }),
    ).toThrow();
  });
});
