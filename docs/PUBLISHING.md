# npm 發布

Package：[ @ntustray/web-authentication-component ](https://www.npmjs.com/package/@ntustray/web-authentication-component)。Repo：[ntustRay/web-authentication-component](https://github.com/ntustRay/web-authentication-component)。

## 0.2.0 發布紀錄

2026-11-09 已以 ntustray 完成 CLI 登入，使用 npm 11.15.0 上傳 staged version。npm 自動檢查已通過；目前等待維護者完成發布專用的 Security key／Passkey 驗證。

已下載 npm 接收的實際 tarball，核對 SHA-1 為 d11153eb893f9ea36368f47c1ef399041a3f79ee，並在獨立 consumer 驗證 core／adapters／server、React 18.3.1 與 19.3.1 SSR。尚不能把上傳 staged version 當成正式發布成功；必須確認 registry 中的 0.2.0 與 latest。

## 本機 staged publishing

1. 確認 npm 帳號擁有 package scope。GitHub username 不會自動授予 npm scope。
2. 使用 Node >=22.14.0 與 npm >=11.15.0。npm 12 需依該版本 engines 使用相容 Node；不要只根據主版本猜測。
3. 執行 npm login，完成網頁登入與 CLI 授權。網頁 cookie 與 CLI token 是兩種授權；不要複製 cookie 或把 token／OTP 放進 repo。
4. 執行 bun install --frozen-lockfile 與 bun run verify。
5. 執行 npm pack --ignore-scripts --dry-run，檢查 source、dist、declarations 與公開文件；不得包含 secrets 或測試資料。
6. 執行下列命令：

```sh
npm stage publish --access public --ignore-scripts --tag latest
npm stage list @ntustray/web-authentication-component
npm stage view <stage-id>
npm stage download <stage-id>
```

ignore-scripts 僅適用於 verify 已完成 build 的產物，不能省略 build。

7. 到 [Staged Packages](https://www.npmjs.com/settings/ntustray/staged-packages) 確認 package、version、tag、shasum。等待 npm 自動檢查完成後點 Approve，完成發布專用 2FA。
8. 核准前的 version 仍不能安裝；npm 可能公開 0.0.0-stage placeholder。Stage ID 是持久待發布項目，與短效 CLI 登入連結不同。
9. 執行以下命令並在全新 consumer 安裝測試，才可記錄正式發布成功：

```sh
npm view @ntustray/web-authentication-component@0.2.0 version dist.integrity
npm view @ntustray/web-authentication-component dist-tags
bun add @ntustray/web-authentication-component@0.2.0
```

同一 package version 在 staged／published 狀態都不可覆寫。不要在 staged 版本仍存在時重跑直接 publish；應核准原 stage，或依實際問題採取新的版本流程。

## 後續 Trusted Publishing

Package settings → Trusted Publisher 設定：

| 欄位                 | 值                                                |
| -------------------- | ------------------------------------------------- |
| Provider             | GitHub Actions                                    |
| Organization or user | ntustRay                                          |
| Repository           | web-authentication-component                      |
| Workflow filename    | publish.yml                                       |
| Environment          | 留空，與此 repo workflow 一致                     |
| Allowed action       | 現有 workflow 使用 direct npm publish，需明確啟用 |

此設定尚未由本次發布流程代為啟用。新增 trusted publisher 是授權新的 workflow；完成設定後才可使用既有 tag workflow。使用 GitHub-hosted runner、Node 24、相容 npm >=11.5.1 與 id-token: write，不需要長效 NPM_TOKEN。

1. 修改 package.json version，同步 changelog、commit／push。
2. 等待 React 18／19 matrix 通過。
3. 建立與 version 一致的 vX.Y.Z tag 並 push。
4. publish.yml 再跑 verify、檢查 tag 與 version、執行 npm publish --access public --provenance --ignore-scripts。
5. 查驗 npm registry、tarball 與 provenance。首版經本機 staging 發布，不宣稱有 GitHub provenance。

## 相容性與採用

- 0.x 階段以 exact version 固定依賴，每次更新附 migration note。
- CSS／文案且不變 API：patch。新增 optional adapter／slot：minor，仍應閱讀相容性說明。
- 改動 AuthAdapter、snapshot 或安全預設：標示 breaking change，更新接入 factory 與測試。
- npm 發布與現有網站切換分開記錄，各站依 [MIGRATION.md](MIGRATION.md) 驗收後採用。

參考：[npm staged publishing](https://docs.npmjs.com/staged-publishing/)、[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)。
