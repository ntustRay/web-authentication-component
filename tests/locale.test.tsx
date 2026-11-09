import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { passwordOnly } from "../src/config.js";
import { createAuthController } from "../src/controller.js";
import {
  AuthLocaleProvider,
  AuthPanel,
  AuthProvider,
  AuthStatus,
  en,
  ja,
  useAuthLocale,
} from "../src/react/index.js";
import { adapter } from "./helpers.js";

afterEach(cleanup);

describe("shared UI language", () => {
  it("switches fields, accessible names and status together without clearing typed input", async () => {
    const controller = createAuthController({
      methods: passwordOnly,
      adapter: adapter(),
    });
    const content = (locale: string) => (
      <AuthProvider controller={controller} locale={locale}>
        <AuthPanel />
        <AuthStatus />
      </AuthProvider>
    );
    const view = render(content("en-US"));
    await screen.findByText(en.signedOut);
    fireEvent.change(screen.getByLabelText(en.password), {
      target: { value: "typed-password" },
    });
    view.rerender(content("ja-JP"));
    expect(screen.getByDisplayValue("typed-password")).toBe(
      screen.getByLabelText(ja.password),
    );
    expect(screen.getByRole("button", { name: ja.showPassword })).toBeTruthy();
    expect(screen.getByText(ja.signedOut)).toBeTruthy();
    expect(screen.getByRole("region").lang).toBe("ja-JP");
  });

  it("translates an existing recovery confirmation when the app language changes", async () => {
    const controller = createAuthController({
      methods: passwordOnly,
      adapter: adapter(),
    });
    const content = (locale: string) => (
      <AuthProvider controller={controller} locale={locale}>
        <AuthPanel initialView="forgot-password" />
      </AuthProvider>
    );
    const view = render(content("en"));
    const email = screen.getByLabelText(en.email);
    fireEvent.change(email, { target: { value: "member@example.com" } });
    const form = email.closest("form");
    if (!form) throw new Error("Missing recovery form");
    fireEvent.submit(form);
    await screen.findByText(en.sent);
    view.rerender(content("ja"));
    expect(screen.getByText(ja.sent)).toBeTruthy();
    expect(screen.queryByText(en.sent)).toBeNull();
  });

  it("merges nested custom dictionaries and falls back safely for an invalid tag", () => {
    function Translation() {
      const { locale, messages } = useAuthLocale();
      return (
        <output lang={locale}>
          {[
            messages.errors.timeout,
            messages.errors.expired,
            messages.issues.blocked,
          ].join("|")}
        </output>
      );
    }
    const view = render(
      <AuthLocaleProvider
        locale="fr"
        messages={{ errors: { timeout: "Délai dépassé" } }}
      >
        <AuthLocaleProvider messages={{ issues: { blocked: "Refusé" } }}>
          <Translation />
        </AuthLocaleProvider>
      </AuthLocaleProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe(
      `Délai dépassé|${en.errors.expired}|Refusé`,
    );
    expect(screen.getByRole("status").lang).toBe("fr");
    view.rerender(
      <AuthLocaleProvider locale="!!">
        <Translation />
      </AuthLocaleProvider>,
    );
    expect(screen.getByRole("status").lang).toBe("en");
  });
});
