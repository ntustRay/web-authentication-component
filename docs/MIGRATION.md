# 專案整合

2026-11-08 盤點帳號下 repository 的 package dependencies 與 Auth entrypoints，找到以下五種使用情境。所有共用模式已放入此 package，並附上可編譯的接入 factory。**現有網站尚未切換依賴，也沒有搬動會員資料。** npm 首次發布與各站 staging 驗證完成後再切換。

| 專案／產品                         | 現有 identity／登入方式                                         | 共用接法                                    | 本 repo 範例                          |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| GitHub Kanban                      | Better Auth／GitHub only                                        | `createBetterAuthAdapter` + `githubOnly`    | `examples/projects/github-kanban.ts`  |
| 工程師選股網                       | Supabase／Email-password／驗證連結                              | `createSupabaseAdapter` + `passwordOnly`    | `examples/projects/stock-platform.ts` |
| Framecheck / Visual Regression Hub | Supabase／GitHub only                                           | `createSupabaseAdapter` + `githubOnly`      | `examples/projects/framecheck.ts`     |
| Dev Map Lab                        | Neon Managed Auth／Email-password／OTP／已配置 social providers | `createNeonAdapter` + 既有 workspace bridge | `examples/projects/dev-map-lab.ts`    |
| Home Way                           | Clerk modal／Clerk server authorization                         | `createClerkAdapter`，保留 Clerk modal      | `examples/projects/home-way.ts`       |

其餘被盤點的作品目前沒有獨立會員登入實作；不為了統一而額外加入帳號系統。舊 tutorial 的 Auth route 是 placeholder，沒有可遷移的登入邏輯。只檢查有關結構與 dependencies，未複製環境檔、憑證、會員資料或 private app 的業務內容。

## 共通接入步驟

1. 安裝已發布的 package，或先在 staging 安裝本 repo 建出的 tarball。不要依賴尚不存在的 npm version。
2. 在 app 的 client provider 建立一次 controller，使用對應 factory。host 保留原 SDK client、cookie 設定與 trusted callback URL。
3. 共用 layout 用同一個 `AuthProvider` 包住 navbar 和 page。navbar 改用 `AuthStatus` 或 `useAuth()`。
4. 登入／註冊／忘記密碼頁改用 `AuthPanel`；保留原版型時以 primitives 或 headless hook 重組。既有路由可用 controlled `view` + `onViewChange`。
5. server 註冊／更新密碼處使用相同 policy。既有會員登入只檢查非空密碼，不因新規則拒絕舊帳號。若是 managed identity endpoint，直接在服務後台設定規則；browser-only callback 無法強制 server policy。
6. 在 backend 同時停用不允許的 providers／Email-password。保留所有 route／Server Action／RPC 的 session 與 owner 驗證。
7. 完成下列驗收，才移除原本重複 UI／state code。更新 lockfile 與 package version pin。

## 各專案保留的責任

### GitHub Kanban

保留 Better Auth server 的 `emailAndPassword.enabled=false`、GitHub scope、token encryption、rateLimit、同源寫入與每 user board queries。共享 package 只取代 login pending／error state 與顯示元件。不要把 GitHub read-only scope 擴大成可寫。

### 工程師選股網

保留 `@supabase/ssr` browser／server clients、Auth callback 的 PKCE、cookie proxy、Server Actions 與 watchlist owner checks。接入範例使用的 callback intents 與路由名稱來自既有流程。

若維持 Server Action 提交，在 host 自訂 `AuthAdapter`，以可序列化 input/result 呼叫原 action；不要把 Next.js redirect exception 當一般 adapter error 吃掉。先把「回傳 AuthResult」與「host navigation」分開，再切換 UI。原站其他已有 feedback 不應在接入時消失。

### Framecheck

保留 GitHub-only、PKCE callback、upload authorization 與私有圖片權限。如果使用既有 server `/auth/sign-in` route 產生 OAuth redirect，可以用 hosted adapter 導向該 route；不必為了 UI package 改 OAuth 協定。browser Supabase 範例則需與原 cookie client 配套。

### Dev Map Lab

保留 native Managed SDK、強制 server-session 查詢、OTP 與 account-specific workspace／IndexedDB namespaces。不要用 cached compatibility `getUser()` 取代既有 verified-session 查詢。

`createLearningAuth` 的 `options.readSession` 可傳回 native SDK 經 server revalidation 的 session；`watchSession` 接既有身份通知。原本 `startAuth`／workspace bridge 仍必須在帳號變更先 lock 舊 store，再切 scope。若使用現有 action wrapper，確保共用 adapter 也走過這些動作；不能只改 navbar。

Neon 的 signup 必須確實啟用 Email verification／OTP。若後台允許未驗證 signup session，UI 仍會拒絕它，但不代表服務端資料已受保護；RLS／RPC 的 verified-email 條件必須保留。

### Home Way

保留 ClerkProvider、modal、protected routes 與 server `auth().protect()`。`createClerkAdapter` 的 `verifySession` 透過 app server 確認身份；`openSignIn` 包住 Clerk modal；`watchSession` 可包住 Clerk listener。

此 bridge 不重寫 Clerk 的 password／MFA／registration，這些仍由 Clerk modal 和設定負責。若將來要求完全自繪 Clerk forms，先確認該 SDK version 支援的 flow，再實作另一個 adapter。

## 各站切換驗收

| 情境                   | 必須觀察到                                    |
| ---------------------- | --------------------------------------------- |
| 原有會員登入           | user ID、資料 scope、server session 正確      |
| 新會員註冊             | 未驗證不取得私人資料；信件實際寄達            |
| 驗證連結／OTP          | 過期與重複使用失敗；有效驗證正確回站          |
| 忘記／重設密碼         | 相同的存在性提示；舊 token 失效；新密碼可登入 |
| GitHub／其他 provider  | callback／取消／拒絕授權／錯誤都有 feedback   |
| Navbar／reload／多分頁 | 登入／登出後狀態一致，舊資料不殘留            |
| 重複點擊／慢網／429    | 只送一次 mutation，有等待與重試提示           |
| Server / RLS           | 修改 browser state 無法取得別人的資料         |

共用 code graph 與 SDK／unit tests 已在本 repo 提供。此表是各站正式切換的實際驗收條件，不代表本次已經執行線上測試。
