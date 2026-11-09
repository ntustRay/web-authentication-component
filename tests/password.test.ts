import { describe, expect, it } from "vitest";
import { assessPassword, resolvePasswordPolicy } from "../src/password.js";

describe("password policy", () => {
  it("accepts 8 through 128 code points by default", () => {
    const character = "\u{1F984}";
    for (const length of [8, 128])
      expect(assessPassword(character.repeat(length)).valid).toBe(true);
    expect(assessPassword(character.repeat(7)).issues).toContain("too-short");
    expect(assessPassword(character.repeat(129)).issues).toContain("too-long");
    expect(assessPassword("12345678").issues).toContain("blocked");
    expect(assessPassword("pAsSwOrD").issues).toContain("blocked");
    expect(
      assessPassword(
        character.repeat(8),
        resolvePasswordPolicy({ minLength: 15 }),
      ).issues,
    ).toContain("too-short");
  });
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
