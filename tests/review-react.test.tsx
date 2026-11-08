import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordOnly } from "../src/config.js";
import {
  type AuthController,
  createAuthController,
} from "../src/controller.js";
import { failure, success } from "../src/errors.js";
import {
  AuthGate,
  AuthPanel,
  type AuthPanelProps,
  AuthProvider,
  PasswordField,
  SignOutButton,
} from "../src/react/index.js";
import type { AuthOutcome, AuthResult, AuthSession } from "../src/types.js";
import { adapter, deferred, password, session } from "./helpers.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function tree(auth: AuthController, props: AuthPanelProps = {}) {
  return (
    <AuthProvider controller={auth}>
      <AuthPanel {...props} />
    </AuthProvider>
  );
}
async function ready(auth: AuthController) {
  await waitFor(() => expect(auth.getSnapshot().status).not.toBe("checking"));
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}

describe("review regressions: complete React flows", () => {
  it("shows a rate-limit error again after switching views without making another SDK request", async () => {
    const signUp = vi.fn(async () =>
      success<AuthOutcome>({ kind: "verification-required", delivery: "code" }),
    );
    const auth = createAuthController({
      adapter: adapter({
        signUp,
        signIn: async () => failure("rate-limited", 60),
      }),
      methods: passwordOnly,
    });
    render(tree(auth));
    await ready(auth);
    fill("Email", "ray@example.com");
    fill("密碼", password);
    fireEvent.submit(screen.getByRole("form", { name: "登入" }));
    await screen.findByText("操作過於頻繁，請稍候再試。");
    fireEvent.click(screen.getByRole("button", { name: "建立帳號" }));
    fill("密碼", password);
    fill("再次輸入密碼", password);
    fireEvent.submit(screen.getByRole("form", { name: "建立帳號" }));
    expect(await screen.findByText("操作過於頻繁，請稍候再試。")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
  it("clears an old OTP after successful resend while preserving the email", async () => {
    const auth = createAuthController({
      adapter: adapter(),
      methods: passwordOnly,
      cooldownSeconds: 0,
    });
    render(tree(auth, { initialView: "verify-email" }));
    await ready(auth);
    fill("Email", "ray@example.com");
    fill("驗證碼", "111111");
    fireEvent.click(screen.getByRole("button", { name: "重新寄送驗證信" }));
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>("驗證碼").value).toBe(""),
    );
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe(
      "ray@example.com",
    );
  });
  it("retains the entered OTP if resend fails", async () => {
    const auth = createAuthController({
      adapter: adapter({
        resendVerification: async () => failure("unavailable"),
      }),
      methods: passwordOnly,
      cooldownSeconds: 0,
    });
    render(tree(auth, { initialView: "verify-email" }));
    await ready(auth);
    fill("Email", "ray@example.com");
    fill("驗證碼", "111111");
    fireEvent.click(screen.getByRole("button", { name: "重新寄送驗證信" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText<HTMLInputElement>("驗證碼").value).toBe(
      "111111",
    );
  });
  it("clears OTP and email when the controller changes on the same verification view", async () => {
    const first = createAuthController({
      adapter: adapter(),
      methods: passwordOnly,
    });
    const next = createAuthController({
      adapter: adapter(),
      methods: passwordOnly,
    });
    const ui = render(tree(first, { initialView: "verify-email" }));
    await ready(first);
    fill("Email", "first@example.com");
    fill("驗證碼", "111111");
    ui.rerender(tree(next, { initialView: "verify-email" }));
    await ready(next);
    expect(screen.getByLabelText<HTMLInputElement>("驗證碼").value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("");
  });
  it("takes resend-code users to a usable verification form", async () => {
    const verifyEmail = vi.fn(async () =>
      success<AuthOutcome>({ kind: "authenticated", session }),
    );
    const auth = createAuthController({
      adapter: adapter({ verifyEmail }),
      methods: passwordOnly,
    });
    render(tree(auth));
    await ready(auth);
    fireEvent.click(screen.getByRole("button", { name: "重新寄送驗證信" }));
    fill("Email", "ray@example.com");
    fireEvent.submit(screen.getByRole("form", { name: "重新寄送驗證信" }));
    await screen.findByLabelText("驗證碼");
    expect(
      screen
        .getByRole("button", { name: /秒後可重新寄送/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    fill("驗證碼", "123456");
    fireEvent.submit(screen.getByRole("form", { name: "驗證 Email" }));
    await waitFor(() =>
      expect(verifyEmail).toHaveBeenCalledWith({
        email: "ray@example.com",
        code: "123456",
      }),
    );
  });
  it("shows a neutral success message when registration requires a disabled verification action", async () => {
    const auth = createAuthController({
      adapter: adapter(),
      methods: { ...passwordOnly, verification: false },
    });
    render(tree(auth, { initialView: "sign-up" }));
    await ready(auth);
    fill("Email", "ray@example.com");
    fill("密碼", password);
    fill("再次輸入密碼", password);
    fireEvent.submit(screen.getByRole("form", { name: "建立帳號" }));
    await screen.findByText(/如果此信箱需要驗證/);
    expect(screen.queryByText("目前不支援這個登入方式。")).toBeNull();
    expect(screen.queryByLabelText("驗證碼")).toBeNull();
    expect(screen.queryByRole("button", { name: "重新寄送驗證信" })).toBeNull();
  });
  it("does not invoke a route callback after its panel unmounts", async () => {
    const gate = deferred<AuthResult<AuthOutcome>>();
    const onViewChange = vi.fn();
    const auth = createAuthController({
      adapter: adapter({ requestPasswordReset: () => gate.promise }),
      methods: passwordOnly,
    });
    const ui = render(
      tree(auth, { initialView: "forgot-password", onViewChange }),
    );
    await ready(auth);
    fill("Email", "ray@example.com");
    fireEvent.submit(screen.getByRole("form", { name: "忘記密碼" }));
    ui.rerender(
      <AuthProvider controller={auth}>
        <p>Other route</p>
      </AuthProvider>,
    );
    await act(async () => {
      gate.resolve(success({ kind: "sent", delivery: "code" }));
      await gate.promise;
    });
    expect(onViewChange).not.toHaveBeenCalled();
  });
  it("does not restore an old route after the controlled view changes", async () => {
    const gate = deferred<AuthResult<AuthOutcome>>();
    const onViewChange = vi.fn();
    const auth = createAuthController({
      adapter: adapter({ requestPasswordReset: () => gate.promise }),
      methods: passwordOnly,
    });
    const ui = render(tree(auth, { view: "forgot-password", onViewChange }));
    await ready(auth);
    fill("Email", "ray@example.com");
    fireEvent.submit(screen.getByRole("form", { name: "忘記密碼" }));
    ui.rerender(tree(auth, { view: "sign-up", onViewChange }));
    await act(async () => {
      gate.resolve(success({ kind: "sent", delivery: "code" }));
      await gate.promise;
    });
    expect(onViewChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "建立帳號" })).toBeTruthy();
  });
  it("clears credentials when the identity controller changes", async () => {
    const first = createAuthController({
      adapter: adapter(),
      methods: passwordOnly,
    });
    const next = createAuthController({
      adapter: adapter(),
      methods: passwordOnly,
    });
    const ui = render(tree(first));
    await ready(first);
    fill("Email", "first@example.com");
    fill("密碼", "first-controller-secret");
    ui.rerender(tree(next));
    await ready(next);
    expect(screen.getByLabelText<HTMLInputElement>("密碼").value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("");
  });
  it("keeps error focus in whichever panel submitted the operation", async () => {
    const auth = createAuthController({
      adapter: adapter({ signIn: async () => failure("invalid-credentials") }),
      methods: passwordOnly,
    });
    render(
      <AuthProvider controller={auth}>
        <AuthPanel />
        <AuthPanel />
      </AuthProvider>,
    );
    await ready(auth);
    const forms = screen.getAllByRole("form", { name: "登入" });
    for (const form of forms) {
      const owner = form.closest("section");
      if (!owner) throw new Error("Missing panel");
      fireEvent.change(within(form).getByLabelText("Email"), {
        target: { value: "ray@example.com" },
      });
      fireEvent.change(within(form).getByLabelText("密碼"), {
        target: { value: "old" },
      });
      fireEvent.submit(form);
      await waitFor(() =>
        expect(auth.getSnapshot().operation.phase).toBe("error"),
      );
      expect(document.activeElement?.closest("section")).toBe(owner);
    }
  });
  it("keeps inputs and submission disabled while the timed-out SDK operation is still settling", async () => {
    const gate = deferred<AuthResult<AuthOutcome>>();
    const auth = createAuthController({
      adapter: adapter({ signIn: () => gate.promise }),
      methods: passwordOnly,
      timeoutMs: 100,
    });
    render(tree(auth));
    await ready(auth);
    vi.useFakeTimers();
    fill("Email", "ray@example.com");
    fill("密碼", password);
    fireEvent.submit(screen.getByRole("form", { name: "登入" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(101);
    });
    const form = screen.getByRole("form", { name: "登入" });
    expect(
      within(form)
        .getByRole("button", { name: /等待|處理/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("密碼").readOnly).toBe(true);
    await act(async () => {
      gate.resolve(success({ kind: "authenticated", session }));
      await gate.promise;
    });
  });
});

describe("review regressions: expiry and composable primitives", () => {
  it("hides expired gated content before awaiting a server recheck", async () => {
    vi.useFakeTimers();
    let server: AuthSession | null = {
      ...session,
      expiresAt: Date.now() + 1000,
    };
    const gate = deferred<AuthResult<AuthSession | null>>();
    let waiting = false;
    const auth = createAuthController({
      adapter: adapter({
        getSession: () =>
          waiting ? gate.promise : Promise.resolve(success(server)),
      }),
      methods: passwordOnly,
    });
    render(
      <AuthProvider controller={auth}>
        <AuthGate
          fallback={<span>Signed out</span>}
          loading={<span>Checking</span>}
        >
          <span>Private content</span>
        </AuthGate>
      </AuthProvider>,
    );
    await act(async () => {
      await auth.refresh();
    });
    expect(screen.getByText("Private content")).toBeTruthy();
    waiting = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.queryByText("Private content")).toBeNull();
    expect(screen.getByText("Checking")).toBeTruthy();
    server = { ...session, expiresAt: Date.now() + 5000 };
    await act(async () => {
      gate.resolve(success(server));
      await gate.promise;
    });
    expect(screen.getByText("Private content")).toBeTruthy();
  });
  it("preserves an explicit password input ID and its label association", () => {
    render(<PasswordField id="host-password" label="Password" />);
    expect(screen.getByLabelText("Password").id).toBe("host-password");
  });
  it("honors the host's preventDefault on a composed sign-out button", async () => {
    const signOut = vi.fn(async () =>
      success<AuthOutcome>({ kind: "complete" }),
    );
    const auth = createAuthController({
      adapter: adapter({ signOut }),
      methods: passwordOnly,
    });
    const onClick = vi.fn(
      (event: import("react").MouseEvent<HTMLButtonElement>) =>
        event.preventDefault(),
    );
    render(
      <AuthProvider controller={auth}>
        <SignOutButton onClick={onClick}>Leave</SignOutButton>
      </AuthProvider>,
    );
    await ready(auth);
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});
