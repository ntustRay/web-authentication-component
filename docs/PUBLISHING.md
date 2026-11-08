# npm 發布

Package name：`@ntustray/web-authentication-component`。Repo：[ntustRay/web-authentication-component](https://github.com/ntustRay/web-authentication-component)。目前尚未發布 npm；本次環境 `npm whoami` 回傳 401，沒有進行 npm publish 或建立 release tag。

## 首次發布

1. 確認 npm 帳號有 `@ntustray` scope 發布權限。如果 npm username 不是這個 scope，修改 package name、README、docs 與 smoke references，或建立有權限的 organization；GitHub username 不會自動授予 npm scope。
2. 執行 `npm login`，完成 npm 本人的登入與 2FA。不要把 token／OTP 貼進 repo 或對話。
3. `bun install --frozen-lockfile`。
4. `bun run verify`。
5. `npm pack --ignore-scripts --dry-run`。檢查只包含公開 source、dist、declarations 與文件。
6. `npm publish --access public`。prepack 會執行 build；本機首次發布不要求 GitHub provenance。
7. `npm view @ntustray/web-authentication-component@0.1.0 version`，確認真實版本可讀後，更新 README 的發布狀態。

不要讓使用端依賴未發布的 version。發布前可安裝 CI artifact 或本機 `npm pack` 的 tarball。

## 後續 Trusted Publishing

Package settings → Trusted Publisher 設定：

| 欄位                 | 值                             |
| -------------------- | ------------------------------ |
| Provider             | GitHub Actions                 |
| Organization or user | `ntustRay`                     |
| Repository           | `web-authentication-component` |
| Workflow filename    | `publish.yml`                  |
| Environment          | 留空，與此 repo workflow 一致  |
| Allowed action       | 明確啟用 direct `npm publish`  |

目前 npm 新增的 trusted publisher 預設可能只允許 staged publishing；此 workflow 使用直接 `npm publish`，因此需要勾選 direct publish。使用 GitHub-hosted runner、Node 24、npm >=11.5.1 與 `id-token: write`。不需要把長效 NPM_TOKEN 放進 GitHub Secrets。

設定後：

1. 修改 `package.json` version，同步 changelog，commit/push。
2. 等待 CI 的 React 18 / 19 matrix 通過。
3. 建立與 package version 一致的 `vX.Y.Z` tag 並 push。
4. `publish.yml` 再跑 verify、檢查 tag 與 version、執行 `npm publish --access public --provenance --ignore-scripts`。
5. 到 npm 檢查版本、tarball 與 provenance。首版與後續每個 version 都不能覆寫。

## 相容性與版本

- `0.x` 階段以 exact version 固定各專案依賴；每次更新附 migration note。
- 只更改 CSS／文案且不變 API：patch。
- 增加 optional adapter／slot：minor；仍需查看 `0.x` 的明確相容性說明。
- 移除／改動 AuthAdapter、snapshot 或安全預設：明確標記 breaking change，更新所有 project factory 與測試。
- npm 發布與現有網站切換是兩件事；各站依 [MIGRATION.md](MIGRATION.md) 驗收後才採用。

參考：[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)、[npm publish](https://docs.npmjs.com/cli/commands/npm-publish)。
