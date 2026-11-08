import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { githubOnly, passwordOnly } from "../../src/config.js";
import { createAuthController } from "../../src/controller.js";
import {
  AuthPanel,
  AuthProvider,
  AuthStatus,
  useAuth,
} from "../../src/react/index.js";
import type { AuthEvent, AuthMethods } from "../../src/types.js";
import "../../src/styles.css";
import "./playground.css";
import { demoAdapter, type Simulation } from "./demo-adapter.js";

type Preset = "github" | "password" | "mixed" | "custom";
const presets: { id: Preset; label: string; detail: string }[] = [
  { id: "github", label: "GitHub only", detail: "單一 OAuth provider" },
  { id: "password", label: "Email + password", detail: "註冊、驗證與密碼重設" },
  { id: "mixed", label: "多種方式", detail: "Email、GitHub 與 Google" },
  { id: "custom", label: "Custom SSO", detail: "接上自己的身份服務" },
];
function Inspector() {
  const { state } = useAuth();
  return (
    <div className="inspector">
      <div className="inspect-heading">
        <h3>Session</h3>
        <span data-status={state.status}>{state.status}</span>
      </div>
      <pre>
        {JSON.stringify(
          {
            status: state.status,
            user: state.session?.user.name ?? null,
            operation: state.operation.phase,
            action: state.operation.action,
            error: state.operation.error?.code ?? null,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}
function App() {
  const [preset, setPreset] = useState<Preset>("mixed");
  const [strict, setStrict] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [simulation, setSimulation] = useState<Simulation>({
    delay: 900,
    response: "success",
  });
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const options = useRef(simulation);
  options.current = simulation;
  const methods = useMemo<AuthMethods>(
    () =>
      preset === "github"
        ? githubOnly
        : preset === "password"
          ? passwordOnly
          : preset === "custom"
            ? {
                ...githubOnly,
                providers: [{ id: "company-sso", label: "Company SSO" }],
              }
            : {
                ...passwordOnly,
                providers: [
                  { id: "github", label: "GitHub" },
                  { id: "google", label: "Google" },
                ],
              },
    [preset],
  );
  const controller = useMemo(
    () =>
      createAuthController({
        adapter: demoAdapter(() => options.current),
        methods,
        cooldownSeconds: 10,
        passwordPolicy: {
          requireUppercase: strict,
          requireLowercase: strict,
          requireNumber: strict,
          requireSymbol: strict,
        },
        onEvent: (event) =>
          setEvents((current) => [event, ...current].slice(0, 6)),
      }),
    [methods, strict],
  );
  return (
    <main className="playground">
      <header className="masthead">
        <a
          href="https://github.com/ntustRay/web-authentication-component"
          className="brand"
        >
          <span className="brand-mark" aria-hidden="true">
            m.
          </span>
          <span>
            MingRay
            <span className="brand-description">Authentication components</span>
          </span>
        </a>
        <a
          className="source-link"
          href="https://github.com/ntustRay/web-authentication-component"
        >
          GitHub source ↗
        </a>
      </header>
      <div className="intro">
        <h1>
          登入，
          <br className="mobile-break" />
          依專案決定。
        </h1>
        <p>
          選擇登入方式，試一次完整流程。
          <br />
          從單一 GitHub 按鈕，到會員註冊與密碼重設。
        </p>
      </div>
      <div className="workspace">
        <aside className="controls">
          <h2>組合你的登入介面</h2>
          <fieldset className="preset-list">
            <legend>登入方式</legend>
            {presets.map((item) => (
              <label
                key={item.id}
                className="preset"
                data-selected={preset === item.id}
              >
                <input
                  type="radio"
                  name="preset"
                  value={item.id}
                  checked={preset === item.id}
                  onChange={() => {
                    setPreset(item.id);
                    setEvents([]);
                  }}
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>
            ))}
          </fieldset>
          <div className="control-options">
            <label className="check-label">
              <input
                type="checkbox"
                checked={strict}
                onChange={(event) => setStrict(event.target.checked)}
              />
              啟用大小寫、數字與符號規則
            </label>
            <label className="select-label">
              外觀
              <select
                value={theme}
                onChange={(event) =>
                  setTheme(event.target.value === "dark" ? "dark" : "light")
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="select-label">
              模擬回應
              <select
                value={simulation.response}
                onChange={(event) => {
                  const response = event.target.value;
                  if (
                    response === "success" ||
                    response === "credentials" ||
                    response === "rate-limit" ||
                    response === "offline"
                  )
                    setSimulation((current) => ({ ...current, response }));
                }}
              >
                <option value="success">成功</option>
                <option value="credentials">帳密錯誤</option>
                <option value="rate-limit">429 / 等待 10 秒</option>
                <option value="offline">服務無法連線</option>
              </select>
            </label>
            <label className="select-label">
              等待時間
              <select
                value={simulation.delay}
                onChange={(event) =>
                  setSimulation((current) => ({
                    ...current,
                    delay: Number(event.target.value),
                  }))
                }
              >
                <option value="250">250 ms</option>
                <option value="900">900 ms</option>
                <option value="2500">2.5 s</option>
              </select>
            </label>
          </div>
          <p className="simulation-note">
            這裡使用記憶體中的模擬資料，不會建立真實帳號或寄信。驗證碼：
            <strong>123456</strong>。
          </p>
        </aside>
        <AuthProvider controller={controller}>
          <section className="preview" aria-label="登入介面預覽">
            <div className="preview-bar">
              <span>Live preview</span>
              <span className="preview-status">
                <span aria-hidden="true" />
                {preset === "github"
                  ? "OAuth"
                  : preset === "custom"
                    ? "Hosted SSO"
                    : "Email / OAuth"}
              </span>
            </div>
            <div className="preview-surface" data-preview-theme={theme}>
              <AuthPanel
                key={`${preset}-${strict}`}
                theme={theme}
                slots={{
                  footer: (
                    <p className="component-footer">
                      你的專案，自己的登入體驗。
                    </p>
                  ),
                }}
              />
            </div>
            <div className="account-bar">
              <span>共用會員狀態</span>
              <AuthStatus />
            </div>
          </section>
          <aside className="details">
            <Inspector />
            <section className="events">
              <h3>操作回饋</h3>
              {events.length === 0 ? (
                <p>操作登入介面後，這裡會顯示狀態變化。</p>
              ) : (
                <ol>
                  {events.map((event, index) => (
                    <li
                      key={`${events.length - index}-${event.type}-${event.action}`}
                    >
                      <span data-event={event.type}>{event.type}</span>
                      <span>{event.action}</span>
                      {event.errorCode && <small>{event.errorCode}</small>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="config-preview">
              <h3>Methods</h3>
              <pre>{JSON.stringify(methods, null, 2)}</pre>
            </section>
          </aside>
        </AuthProvider>
      </div>
      <footer className="site-footer">
        <span>React UI / Headless controller / Provider adapters</span>
        <span>TypeScript · Bun · Biome</span>
      </footer>
    </main>
  );
}
const element = document.getElementById("root");
if (!element) throw new Error("Missing root");
createRoot(element).render(<App />);
