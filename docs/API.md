# Public API

## Package entrypoints

| Entry                   | 用途                                      | Runtime 依賴                   |
| ----------------------- | ----------------------------------------- | ------------------------------ |
| `.`                     | 型別、presets、policy、errors、controller | 無                             |
| `/react`                | Provider、hooks、UI、primitives、語系     | React 18.3 / 19                |
| `/adapters/supabase`    | Supabase Auth port                        | host 提供已建立的 SDK client   |
| `/adapters/better-auth` | Better Auth native port                   | host 提供已建立的 SDK client   |
| `/adapters/neon`        | Neon native + OTP port                    | host 提供 Managed SDK          |
| `/adapters/hosted`      | 任意 hosted / SSO；Clerk bridge           | host 提供 session / modal port |
| `/server`               | 密碼、origin、rate limit、recovery tools  | Node `crypto`                  |
| `/styles.css`           | scoped、opt-in CSS                        | 無                             |

## AuthConfig

```ts
interface AuthConfig {
  adapter: AuthAdapter;
  methods: AuthMethods;
  passwordPolicy?: Partial<PasswordPolicy>;
  requireVerifiedEmail?: boolean; // default true
  cooldownSeconds?: number; // default 60，僅 UX
  timeoutMs?: number; // default 30000；整數 100–2147483647
  onEvent?: (event: AuthEvent) => void;
}
```

`cooldownSeconds` 必須是 0–2147483 的整數，避免 JavaScript timer overflow。Controller 會複製並凍結 methods、provider allowlist、capabilities 與 password policy；建立後請透過新 controller 更換設定。各內建 adapter 也會先驗證已啟用的 SDK methods，缺少功能時在建立階段失敗。

Controller 在 client boundary 建立一次；不要每次 render 重建。SSR 時每個 request／client tree 使用自己的 controller，不可將可變 session controller 放進跨 request 的 server singleton。

```ts
interface AuthMethods {
  password: boolean;
  registration: boolean;
  recovery: boolean;
  verification: boolean;
  providers: readonly { id: string; label: string }[];
}
```

`githubOnly` 與 `passwordOnly` 是現成 presets。registration／recovery／verification 需要 password。至少啟用 password 或一個 provider。重複 provider ID、缺少 adapter method、adapter capability 不符會在初始化拋出設定錯誤。實際 server 仍需同步關閉停用的 method。

## Controller

```ts
const auth = createAuthController(config);
const stop = auth.start(); // React AuthProvider 自動管理，不需再手動 start
const unsubscribe = auth.subscribe(() => render(auth.getSnapshot()));
await auth.signIn({ email, password });
await auth.signUp({ email, password, name }, confirmation);
await auth.signInWithProvider("github");
await auth.requestPasswordReset(email);
await auth.resetPassword({ email, password, code, token }, confirmation);
await auth.resendVerification(email);
await auth.verifyEmail({ email, code });
await auth.signOut();
await auth.refresh(); // 使用者明確重試；允許重新顯示 server 已驗證的 session
await auth.refresh({ background: true }); // focus／visibility／背景事件；保留登出失敗的隱藏規則
await auth.cancelRedirect(); // popup 被關閉／redirect 沒發生
auth.clearFeedback();
unsubscribe();
stop();
```

操作回傳 `AuthResult<AuthOutcome>`。呼叫端可處理 result；狀態已同步更新。重複操作被拒絕，不會重送 backend。`refresh()` 回傳 void，錯誤會令 status 成為 `unavailable` 並清除顯示用 session。

| Outcome                 | 意義                                           |
| ----------------------- | ---------------------------------------------- |
| `authenticated`         | adapter 已向 server 確認 session               |
| `verification-required` | 顯示驗證頁，不授予會員狀態                     |
| `sent`                  | 顯示相同的寄送提示，不透露帳號存在性           |
| `redirecting`           | OAuth／hosted flow 已開始；可取消後重新查詢    |
| `complete`              | 驗證／密碼重設／登出完成；不是登入成功的同義詞 |

`getSnapshot()` 的 session、user、operation、error 皆為複製後凍結的唯讀值；讀取沒有變更時保持相同 reference。Custom adapter 回傳的額外 SDK 欄位不會進入 result 或 snapshot。`getServerSnapshot()` 固定為 checking／null，供 SSR hydration 使用。snapshot 是 UI 資料，不是 authorization token。

```ts
interface AuthSnapshot {
  status: "checking" | "anonymous" | "authenticated" | "unavailable";
  session: AuthSession | null;
  operation: {
    id: number; // 每次操作／輸入錯誤的識別碼；idle 為 0
    phase:
      | "idle"
      | "pending"
      | "settling"
      | "redirecting"
      | "success"
      | "error";
    action: AuthAction | null;
    outcome: AuthOutcome["kind"] | null;
    error: { code: AuthErrorCode; retryAfterSeconds: number | null } | null;
  };
  cooldownUntil: number; // epoch milliseconds
}
```

`AuthSession` 只包含 `user: { id, email, name, emailVerified }` 與 `expiresAt`（epoch milliseconds 或 null）。沒有 access／refresh／provider token。`onEvent` 只包含 `type`、`action`、`errorCode`，不帶輸入、email 或 user ID。

`settling` 表示呼叫端已收到 timeout 或 lifecycle cancellation，但 SDK request 仍未結束。這時禁止新 mutation；`signOut()` 會排在原 request 後執行。即使最後一個 consumer unmount，已明確要求的登出仍會完成 SDK 呼叫；原 caller 只會收到 cancelled，舊 callback 不會改動新 UI。SDK 永不回覆時 controller 會維持鎖定，不能把 timeout 當成 request 已取消。

登出失敗／逾時先隱藏該帳號。背景 refresh 驗證到同一帳號時維持 unavailable；不同帳號可顯示，null 轉 anonymous。若登出當下不知道 user ID，背景讀到任何帳號皆保持隱藏。明確 `refresh()`、新的登入成功或 SDK 登出最終成功可解除。React focus／visibility 與 SDK 通知使用 background 模式。這不是 server session 撤銷。

Session `expiresAt` 到期時會先清除 UI，再向 server 驗證；focus／visibility 會補做背景檢查。瀏覽器可能暫停背景 timer，這些 UI 措施不取代 server expiry／authorization。

## PasswordPolicy

| 欄位                                    | 預設                                            |
| --------------------------------------- | ----------------------------------------------- |
| `minLength` / `maxLength`               | 8 / 128 Unicode code points                     |
| `maxUtf8Bytes`                          | null；byte-limited backend 可設定 72 等實際上限 |
| `requireUppercase` / `requireLowercase` | false / false                                   |
| `requireNumber` / `requireSymbol`       | false / false                                   |
| `blocklist`                             | 小型離線 starter list；不是完整 breach corpus   |

`resolvePasswordPolicy(overrides)` 驗證設定。`assessPassword(password, policy)` 回傳 `{ valid, issues }`，不改動密碼。複雜度規則只用在新密碼。選擇字元組合規則是專案需求，不代表符合 NIST 的預設建議。

`validateNewPassword(password, { policy, isCompromised })` 在 server 使用同一 policy。若設定 breach checker 而服務失敗，會 fail closed。Package 不會自行把密碼送到外站。

## 自訂 adapter

`AuthAdapter` 與所有 input／result 型別由 root export。必要方法是 `getSession()` 與 `signOut()`；其他方法按 `capabilities` 開啟。範例：

```ts
const adapter: AuthAdapter = {
  id: "my-sso",
  capabilities: {
    password: false,
    registration: false,
    recovery: false,
    verification: false,
    providers: ["company-sso"],
  },
  getSession: readVerifiedServerSession,
  signOut: endServerSession,
  signInWithProvider: beginServerOAuth,
};
```

Adapter 必須處理真實協定，不可只回傳成功。透過 `success(value)`、`failure(code, retryAfterSeconds)` 建立 result；不得把 raw provider message 放進公開錯誤。Throw 會被 controller 捕捉並轉成已知錯誤碼。Controller 還會重建 allowlisted session／outcome／error，剝除額外欄位並拒絕格式錯誤的值；這無法證明自訂 adapter 確實詢問 server，該責任仍在 adapter 作者。

`subscribe(listener)` 只發出「身份可能變更」的通知，controller 會先清除舊 UI session，再於 下一個 task 重新向 server 驗證。不要在 Supabase `onAuthStateChange` callback 裡 await 其他 Auth SDK calls。

`requireVerifiedEmail: false` 允許 server 已確認、但 email 未驗證的帳號；為 true 時，signup 的未驗證 session 會轉 verification-required，登入則拒絕。沒有 session 的 signup 不可報 authenticated。

`resetPassword` 回傳 complete 前應結束本機 recovery session。需要撤銷其他裝置／token 時，在 backend 實作；本機登出不等於立即撤銷已簽發的 JWT。

## React

| Component / hook      | 主要 props / 回傳                                                                      |
| --------------------- | -------------------------------------------------------------------------------------- |
| `AuthProvider`        | `controller`, `children`, `locale`, `messages`；自動 start／unsubscribe／focus refresh |
| `useAuth()`           | controller methods + `state`                                                           |
| `useAuthController()` | 只取 controller，不訂閱 snapshot                                                       |
| `AuthPanel`           | 下表                                                                                   |
| `AuthStatus`          | `messages`, `className`, signed-out `children`                                         |
| `AuthGate`            | `children`, `fallback`, `loading`；僅 UI gate                                          |
| `AuthField`           | standard input props + `label`, `error`, `hint`                                        |
| `PasswordField`       | AuthField props + `messages`；visibility / Caps Lock                                   |
| `AuthButton`          | standard button props + `pending`, `loadingIcon`                                       |
| `AuthFeedback`        | `tone`, `focus`, `focusKey`, `children`                                                |
| `SignOutButton`       | standard button props；綁定共用 signOut                                                |
| `LoadingIcon`         | `className`                                                                            |

| AuthPanel prop           | 預設／用途                                                            |
| ------------------------ | --------------------------------------------------------------------- |
| `initialView`            | `sign-in`；uncontrolled 起始頁                                        |
| `view` / `onViewChange`  | controlled view；可接 router                                          |
| `locale`                 | `zh-TW`；另有 `en`、`ja`                                              |
| `messages`               | 部分覆寫；errors／issues 會逐項合併                                   |
| `theme`                  | `auto`、`light`、`dark`                                               |
| `className` / `unstyled` | 自訂 root／停用預設 root class                                        |
| `disabled`               | 服務未設定時停用表單與 provider                                       |
| `notice`                 | `{ tone, message }`，顯示 callback／route 提示                        |
| `resetToken`             | host 已驗證 callback 的 Better Auth link token；不進 snapshot         |
| `slots`                  | `header`, `footer`, `loadingIcon`, `providerIcon(id)`, `field(props)` |

`focusKey` 可傳 operation.id，讓新的錯誤重新 focus；AuthPanel 只會由提交該操作的 panel 取得焦點。`PasswordField` 保留 host id；`SignOutButton` 先執行 host onClick，preventDefault 可攔截登出。

View：`sign-in`、`sign-up`、`forgot-password`、`reset-password`、`verify-email`、`resend-verification`。切頁、controller 或 resetToken 改變會清除 password、confirmation、OTP，並使舊表單 callback 失效。更換 controller 同時清除 email。成功重寄 code 會清空舊 OTP，失敗保留輸入；code resend 會導入 verify-email 表單。停用 verification 的 signup 只顯示寄送提示，不導入不支援的畫面。驗證碼接受 4–12 位數字，真實長度與有效性仍由 provider 驗證；Neon 使用 6 位碼。

`slots.field` 收到標準 input props、label／error／hint、`secret`、messages。必須保留 input 的 onChange、value、name、autocomplete、required、readOnly 與錯誤關聯，或直接組合內建 primitives。

| CSS variable                                      | 用途                   |
| ------------------------------------------------- | ---------------------- |
| `--auth-bg`, `--auth-text`, `--auth-muted`        | 背景／正文／次要文字   |
| `--auth-border`, `--auth-error`, `--auth-success` | 邊框與狀態             |
| `--auth-accent`, `--auth-accent-text`             | 主要按鈕與文字         |
| `--auth-radius`, `--auth-duration`                | 圓角與 transition 時間 |

覆蓋方式：`.my-product-auth { --auth-accent: #222; --auth-radius: 2px; }`。預設 CSS 放在 `@layer mr-auth`；app 的未分層樣式可覆蓋它。減少動態效果偏好會停止 spinner 旋轉，但保留等待文字。

AuthLocaleProvider 可在任何子樹指定語系；useAuthLocale() 提供已解析的語言與字典。未支援的語言以英文補足，省略語言會繼承上層設定。切換語言保留表單輸入。
