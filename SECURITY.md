# Security

這個 package 共用登入 UI、狀態與 SDK 接法。它不把不同專案合併成同一個會員資料庫，也不提供獨立的 OAuth／session server。

## 哪裡負責保護

| 控制                | Package 已提供                                                    | Host / identity service 必須完成                                                       |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 停用登入方式        | config capability validation、controller method guards            | 真正關閉 server password／provider endpoints                                           |
| 密碼規則            | Unicode 長度、byte limit、可配置字元、starter blocklist、確認密碼 | 註冊／重設 server enforcement；完整 breach corpus／provider protection                 |
| 密碼儲存            | `/server` scrypt helpers 供自建 backend 使用                      | Supabase／Better Auth／Neon 使用原服務 hashing；不得先在 browser hash 再當密碼         |
| Brute force         | pending、429 提示、UX cooldown                                    | 每 IP + 每帳號的原子、跨 instance rate limit；可信任 proxy IP                          |
| Account enumeration | generic recovery／signup UI；已知存在性錯誤轉相同 outcome         | backend status、內容與時間差也要一致                                                   |
| Reset token         | CSPRNG 256-bit token、只存 SHA-256 digest、atomic consume port    | store transaction／唯一消耗／期限、實際 email、重設成功後撤銷 session                  |
| CSRF / origin       | `assertTrustedOrigin` mutation guard                              | 實際在 handler 使用，保留 provider CSRF、OAuth state／PKCE                             |
| Session             | server-session reads、expiry 隱藏、SDK queue、失敗登出的背景保護  | HttpOnly／Secure／SameSite cookies、server authorization、session rotation／revocation |
| 帳號驗證            | 預設拒絕 unverified session                                       | server 與資料存取也拒絕未驗證帳號                                                      |
| Secret exposure     | snapshot／events 無密碼、OTP、access token；raw error 不公開      | log／APM request body／browser recorder 必須 redact；不用 secrets 的 NEXT_PUBLIC 變數  |
| 私人資料            | UI 帳號切換先清除 session                                         | RLS／owner filtering、清空舊帳號 store、停止舊工作寫入新帳號                           |

前端 cooldown 可以被重新載入繞過，它只降低誤觸。它不能代替 server rate limit。`requireVerifiedEmail: false` 只應用在不依賴 Email 驗證的既有 identity model。

## Controller 與 adapter 的信任邊界

Custom adapter 的 session、outcome、error 會經 runtime shape validation，重新建立允許欄位並移除額外 SDK data。公開 session／user／operation／error 與 method／policy 設定深層唯讀。這避免 structural typing 意外把 token 或 raw error 帶入 snapshot；無法替不可信任的 adapter 證明身份，也不能阻止它把秘密塞進允許的 name 等字串欄位。

Timeout 不代表遠端取消。原 SDK mutation 完成前保留鎖；明確登出會排隊且不因 unmount 取消。失敗／timeout 登出的身份在背景 revalidation 後仍維持隱藏；明確 refresh() 是使用者接受重新檢查的重試。這不表示 cookie 或 JWT 已在 server 失效。

Session 到期會先清 UI 再驗證；瀏覽器可節流／暫停 timer。Server expiry、authorization 與 revocation 仍是必要控制。

Supabase adapter 使用 getUser() 向 Auth server 驗證當前身份，不信任 user_metadata 的 email verification。getUser() 只能證明有效的當前 session，不能單獨證明它來自 recovery callback。Reset 頁由 host 的有效 PKCE／recovery callback 導向；對敏感密碼變更有額外要求時，在 provider／server 啟用 reauthentication。不可把 query flag 或前端記號當成 recovery 授權。

## 新密碼政策

預設 8–128 Unicode code points，允許空白與 Unicode，不強迫混合字元；不 trim、truncate 或自行改變 normalization。若 backend 使用 NFC，必須在註冊與驗證兩邊一致處理，不能只改 client。

預設 blocklist 很小，只是離線 starter list，不是完整的 breached password protection。正式服務需啟用 provider 的 leaked-password protection，或在 server 的 `isCompromised` port 查本機 corpus／可信任的 breach service。Package 不會自動傳送密碼到外部服務。

自訂 backend 範例：

```ts
import {
  assertAllowedMethod,
  assertTrustedOrigin,
  enforceRateLimit,
  hashPassword,
  validateNewPassword,
} from "@ntustray/web-authentication-component/server";
import { passwordOnly } from "@ntustray/web-authentication-component";

// request body schema、email、confirmation 也要在 server 驗證。
assertTrustedOrigin(request, [configuredSiteOrigin]);
assertAllowedMethod("registration", passwordOnly);
await enforceRateLimit(distributedLimiter, opaqueAccountAndIpKey);
await validateNewPassword(password, {
  policy,
  isCompromised: localBreachCheck,
});
const encoded = await hashPassword(password, { policy });
// 只保存 encoded；使用參數化 SQL，勿保存 request body 或 plaintext。
```

scrypt 使用 `N=131072, r=8, p=1`、16-byte random salt、64-byte key。`verifyPassword` 使用 timing-safe comparison 並拒絕未知／攻擊者指定的 cost encoding。每次 derivation 約需 128 MiB working memory；先做 rate limit，依部署資源限制 hash concurrency。對不存在的帳號也應執行等價的 dummy hash verification，以減少 timing enumeration。

若既有 identity service 管理密碼，不可用 helpers 另外存第二份 hash。Server helper 不會替你建立完整會員系統。

## RecoveryStore 的必要語意

`consume(digest, now)` 必須把「確認未過期」與「刪除／標記已使用」放在同一個原子操作。先 SELECT 再無條件 DELETE 會有競態。可使用：

```sql
delete from private.password_recovery
where digest = $1 and expires_at > $2
returning user_id;
```

這是 host store 的 contract 範例；本 repo 不會修改任何線上 schema。重設後撤銷舊 reset token／session，cookie 與 JWT 的實際失效行為由服務端控制。本機 signOut 不代表已簽發 JWT 立即無效。

## OAuth 與 callback

- callback URL 來自可信任 app 設定；在 provider allowlist 設定完整 origin。
- `safeRedirectPath` 只允許 local relative path，拒絕 scheme-relative、backslash、encoded slash 與控制字元。
- 保留 Supabase PKCE code exchange、Neon Managed SDK 的 verifier／cookie、Clerk／Better Auth 的原 server 驗證。
- GitHub-only apps 必須在 backend 關閉 Email/password；不要只在 React 隱藏輸入欄位。
- 未實作 generic account linking。連結兩個帳號前必須重新驗證，不可只根據相同 email 自動合併。

## 驗證界線

本 repo 的測試執行真實 scrypt、controller 非同步競態與 React DOM 互動；SDK 測試使用 contract fixtures 與模擬 response。它們不能證明各站的 OAuth credentials、SMTP、cookie domain、RLS 或資料 owner 設定正確。這些要在各自 staging 執行完整流程後才能切換。

## 回報

請不要在 public issue 貼上 token、密碼、user data 或可用的 secret。使用 GitHub private vulnerability reporting（若維護者已啟用），或先透過不含漏洞細節的 issue 請求私人聯絡管道。

參考：[NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)、[OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)、[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。

For password-only services that follow NIST SP 800-63B-4, set the minimum to 15 in both the controller and the identity server.
