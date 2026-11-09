# Changelog

## 0.2.0 — 2026-11-09

2026-11-08 完成多輪 review，2026-11-09 首次正式發布 npm；latest 為 0.2.0。發布與 registry 驗證見 [PUBLISHING.md](docs/PUBLISHING.md)。

- SDK mutation queue 在 timeout／unmount 後保留鎖，明確 signOut 仍排隊完成。
- 失敗／timeout 的登出身份保持隱藏，背景 revalidation 與明確 refresh() 分開。
- 防止舊身份結果／事件覆蓋新帳號；補齊被操作中斷的 canonical read 與 session expiry。
- Public boundary 清洗 custom adapter session／outcome／error；設定與 snapshot 深層唯讀。
- React controller／view／resetToken scope 清除秘密輸入，阻止舊 callback；修正 OTP resend、429 feedback 與多 panel focus。
- Adapter 初始化先驗證啟用的 SDK methods；signup email policy 與無 session 的 Supabase 回覆一致。
- PasswordField 保留 id；SignOutButton 支援 host onClick／preventDefault。更新 API、AI 指南與 code graph。

相容性：operation 新增 id 與 settling phase；公開資料改為 readonly。0.1 使用端的 exhaustive phase switch 必須處理 settling，不能直接修改 methods／policy／snapshot。refresh() 保留明確重試語意；host 自動事件請改用 refresh({ background: true })。

## 0.1.0 — 2026-11-08

首次 package 實作，尚未發布 npm。

- Framework-independent AuthAdapter / AuthController / safe session contract。
- GitHub-only、password-only、mixed 與 custom / hosted provider 組合。
- Supabase、Better Auth、Neon OTP、Clerk hosted bridges。
- React forms、headless hooks、primitives、slots、語系、themes、reduced motion。
- Password policy、server helpers、競態／逾時／重複送出防護。
- Project adoption factories、互動 playground、AI 指引、compiler-derived code graph。
- Behavioral / SDK compatibility tests、npm packaging、CI / publishing workflow。
