# 0.2.0 Review 與修正

日期：2026-11-08。範圍為 package source、public API、React、adapters、server boundaries 與發布產物。

Terra（gpt-6.1-terra）與另一位 sub-agent 分別獨立檢查 security／controller、React／API；主要 agent 交叉重現、實作修正、補上 regression tests，再交回 reviewers 確認。沒有以 review 建議本身當成通過證明。

## 已修正的問題

| 問題與觸發方式                                                          | 修正後行為                                                             | 回歸測試                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| request timeout 後解除鎖；舊 SDK signin 稍後寫回 cookie                 | 保留實際 SDK barrier，phase 為 settling；禁止新 mutation，signOut 排隊 | review-controller             |
| 登出排隊後元件 unmount，SDK 登出被取消                                  | 原 caller cancelled，但明確 SDK 登出仍執行；remount 不復活舊登入       | review-controller             |
| 登出 pending／failure／timeout 後，focus 或 SDK notify 重現舊帳號       | 全程先隱藏；background read 不能恢復同一帳號，未知 ID 時隱藏所有身份   | review-controller             |
| A 登出失敗、切到 B 後，B 再登出失敗仍沿用 A guard                       | 每次新登出使用目前身份；逐次 snapshot 檢查 B 未重現                    | review-controller             |
| 舊 A 的 signin／signout／reset 結果覆蓋新 B，或向 host 回傳過時 success | 重新讀 canonical session，取消過時 result／event，保留新身份           | controller、review-controller |
| 初始 read 被 mail mutation 中斷；切換帳號失敗或 signup 僅需驗證信       | 排程 canonical revalidation，維持真實 session 與操作 feedback          | review-controller             |
| cancelRedirect 可解除一般 password mutation                             | 僅取消已進入 redirecting 且 SDK 已完成的流程                           | review-controller             |
| session 只在取得時檢查 expiresAt                                        | 到期先清 UI，再驗證；focus／visibility 補查                            | review-react                  |
| custom adapter 的結構型別夾帶 token、raw error、可變巢狀物件            | runtime shape guard、allowlist 重建與 freeze，拒絕 malformed data      | review-controller             |
| 呼叫端可修改 methods／policy／capabilities；timer 超過平台範圍          | 複製並 freeze 設定；驗證 timeout／cooldown 範圍                        | review-controller             |
| controller 更換後仍保留前服務的密碼／OTP；舊請求導頁                    | controller／view／resetToken scope 清除秘密欄位、忽略過時 callback     | review-react                  |
| 重寄 code 未進入 OTP 表單；成功重寄後仍顯示舊碼                         | 正確導向；成功清空舊碼，失敗保留輸入                                   | review-react                  |
| signup 導向被停用的 verification 畫面                                   | 顯示通用寄送提示並回登入畫面                                           | review-react                  |
| 429 後切頁再送出沒有回饋；兩個 panel 搶錯誤焦點                         | 發布新的 operation.id／error；只有提交者 focus                         | review-react                  |
| PasswordField 忽略 host id；SignOutButton 忽略 host handler             | 保留 id；組合 onClick 並尊重 preventDefault                            | review-react                  |
| adapter 已啟用但缺 SDK method，直到操作時才失敗                         | factory 建立時驗證；複製 provider allowlist                            | review-adapters               |
| native signup 把有 session 的未驗證 email 一律判為需驗證                | 由 controller 的 requireVerifiedEmail 統一判定                         | review-adapters               |
| Supabase missing-session error 仍附 stale user                          | 視為無 session，不使用 stale user                                      | review-adapters               |

測試檔位於 tests/，沿用既有 controller／React／adapter coverage，新增 review-controller、review-react、review-adapters。驗證命令與結果見 [VERIFICATION.md](VERIFICATION.md)。

## 0.1 使用端調整

1. 自訂 operation phase switch 加入 settling；此階段不可允許新的登入 mutation。signOut 可排隊。
2. 公開 methods、policy、capabilities、snapshot 改為唯讀。需要新設定時建立新 controller。
3. 自訂自動 focus／visibility listener 呼叫 refresh({ background: true })；refresh() 保留使用者明確 retry 語意。
4. 多個 UI 共用 controller 時，使用 operation.id 判斷提交者；AuthFeedback 可傳 focusKey 重新聚焦。
5. 更換 controller 或 resetToken 會清除表單輸入；host 不可依賴舊秘密欄位被保留。

## 驗證限制

- Reviewer 未找到其範圍內的其他可重現缺陷，不等於獨立 security audit／penetration test。
- Public boundary 防止額外 SDK 欄位意外外洩；不可信任的 adapter 仍可能在允許欄位放入錯誤資料。getSession 必須在 server 驗證。
- Supabase getUser() 證明當前 session，不單獨證明 recovery 來源；host 應保留有效 callback 與必要 reauthentication。
- UI 隱藏與 expiry timer 不是 server revocation／authorization。SDK 不支援 abort 時，timeout 無法取消遠端 side effect。
- 沒有為 review 寄送真實郵件、搬移會員、切換 production auth 或發布 npm。
