import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { githubOnly, passwordOnly } from "../src/config.js";
import { createAuthController } from "../src/controller.js";
import { failure, success } from "../src/errors.js";
import { AuthPanel, AuthProvider, AuthStatus } from "../src/react/index.js";
import type { AuthMethods, AuthOutcome, AuthResult } from "../src/types.js";
import { adapter, deferred, password, session } from "./helpers.js";

afterEach(cleanup);
function mount(
  methods: AuthMethods = passwordOnly,
  backend = adapter(),
  view: "sign-in" | "sign-up" = "sign-in",
) {
  const auth = createAuthController({ adapter: backend, methods });
  render(
    <AuthProvider controller={auth}>
      <AuthPanel initialView={view} />
      <aside aria-label="Account">
        <AuthStatus />
      </aside>
    </AuthProvider>,
  );
  return auth;
}
describe("React flows", () => {
  it("GitHub-only renders no password, registration or recovery UI", async () => {
    mount(githubOnly);
    expect(
      screen.getByRole("button", { name: "使用 GitHub 登入" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByText("建立帳號")).toBeNull();
    expect(screen.queryByText("忘記密碼")).toBeNull();
    await screen.findByText("尚未登入");
  });
  it("password-only has no social provider", async () => {
    mount();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByText("使用 GitHub 登入")).toBeNull();
    await screen.findByText("尚未登入");
  });
  it("renders arbitrary provider IDs through the same interface", async () => {
    mount({
      ...passwordOnly,
      providers: [{ id: "corporate-sso", label: "Company SSO" }],
    });
    expect(
      screen.getByRole("button", { name: "使用 Company SSO 登入" }),
    ).toBeTruthy();
    await screen.findByText("尚未登入");
  });
  it("shows a real pending state and updates account navigation after sign-in", async () => {
    const pending = deferred<AuthResult<AuthOutcome>>();
    mount(passwordOnly, adapter({ signIn: () => pending.promise }));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ray@example.com");
    await user.type(screen.getByLabelText("密碼"), password);
    await user.click(screen.getByRole("button", { name: "登入" }));
    const button = screen.getByRole("button", { name: "處理中…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.querySelector(".mra-spinner")).not.toBeNull();
    pending.resolve(success({ kind: "authenticated", session }));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("complementary", { name: "Account" }),
        ).getByText("Ray"),
      ).toBeTruthy(),
    );
    expect(screen.queryByLabelText("密碼")).toBeNull();
  });
  it("focuses password confirmation errors and preserves password manager support", async () => {
    mount(passwordOnly, adapter(), "sign-up");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ray@example.com");
    await user.type(screen.getByLabelText("密碼", { exact: true }), password);
    await user.type(screen.getByLabelText("再次輸入密碼"), "different");
    await user.click(screen.getByRole("button", { name: "建立帳號" }));
    await screen.findByText("兩次輸入的密碼不一致。");
    expect(document.activeElement).toBe(screen.getByLabelText("再次輸入密碼"));
    expect(
      screen
        .getByLabelText("密碼", { exact: true })
        .getAttribute("autocomplete"),
    ).toBe("new-password");
  });
  it("clears passwords when switching views", async () => {
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("密碼"), "private-value");
    await user.click(screen.getByRole("button", { name: "建立帳號" }));
    expect(
      screen.getByLabelText<HTMLInputElement>("密碼", { exact: true }).value,
    ).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("再次輸入密碼").value).toBe(
      "",
    );
  });
  it("toggles visibility and shows Caps Lock without blocking paste", async () => {
    mount();
    const user = userEvent.setup();
    const input = screen.getByLabelText<HTMLInputElement>("密碼");
    await user.click(screen.getByRole("button", { name: "顯示密碼" }));
    expect(input.type).toBe("text");
    fireEvent.keyUp(input, { key: "A", modifierCapsLock: true });
    await screen.findByText("Caps Lock 已開啟。");
    await user.click(input);
    await user.paste(password);
    expect(input.value).toBe(password);
  });
  it("shows safe errors with alert focus", async () => {
    mount(
      passwordOnly,
      adapter({ signIn: async () => failure("invalid-credentials") }),
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ray@example.com");
    await user.type(screen.getByLabelText("密碼"), "old");
    await user.click(screen.getByRole("button", { name: "登入" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Email 或密碼不正確");
    expect(document.activeElement).toBe(alert);
  });
  it("completes signup into code verification with resend cooldown", async () => {
    mount(passwordOnly, adapter(), "sign-up");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ray@example.com");
    await user.type(screen.getByLabelText("密碼", { exact: true }), password);
    await user.type(screen.getByLabelText("再次輸入密碼"), password);
    await user.click(screen.getByRole("button", { name: "建立帳號" }));
    expect(await screen.findByLabelText("驗證碼")).toBeTruthy();
    expect(screen.queryByLabelText("密碼")).toBeNull();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /秒後可重新寄送/ })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
  });
  it("creates unique labels when multiple panels share a page", async () => {
    const auth = createAuthController({
      adapter: adapter(),
      methods: passwordOnly,
    });
    render(
      <AuthProvider controller={auth}>
        <AuthPanel />
        <AuthPanel />
      </AuthProvider>,
    );
    const inputs = screen.getAllByLabelText("Email");
    expect(inputs[0]?.id).not.toBe(inputs[1]?.id);
    await screen.findAllByRole("form", { name: "登入" });
  });
  it("guards double click even before React paints", async () => {
    const pending = deferred<AuthResult<AuthOutcome>>();
    const signIn = vi.fn(() => pending.promise);
    mount(passwordOnly, adapter({ signIn }));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ray@example.com");
    await user.type(screen.getByLabelText("密碼"), password);
    const form = screen.getByRole("form", { name: "登入" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(signIn).toHaveBeenCalledTimes(1);
    pending.resolve(success({ kind: "authenticated", session }));
    await screen.findAllByText("Ray");
  });
});
