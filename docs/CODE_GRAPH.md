# Code graph

由 TypeScript compiler API 從 `src/` 產生；執行 `bun run graph` 更新。JSON 同時包含宣告與可靜態解析的 function calls；callback、動態 adapter dispatch 與 runtime data flow 需配合 [ARCHITECTURE.md](ARCHITECTURE.md) 閱讀。

## core

```mermaid
flowchart TD
  n5["boundary.ts"]
  n6["config.ts"]
  n7["controller.ts"]
  n8["errors.ts"]
  n9["index.ts"]
  n10["password.ts"]
  n20["types.ts"]
  n5 --> n8
  n5 --> n20
  n6 --> n20
  n7 --> n5
  n7 --> n6
  n7 --> n8
  n7 --> n10
  n7 --> n20
  n8 --> n20
  n9 --> n6
  n9 --> n7
  n9 --> n8
  n9 --> n10
  n9 --> n20
  n10 --> n20
```

| Module | 跨層依賴 |
| --- | --- |
| `src/boundary.ts` | — |
| `src/config.ts` | — |
| `src/controller.ts` | — |
| `src/errors.ts` | — |
| `src/index.ts` | — |
| `src/password.ts` | — |
| `src/types.ts` | — |

## react

```mermaid
flowchart TD
  n11["react/context.tsx"]
  n12["react/index.ts"]
  n13["react/messages.ts"]
  n14["react/panel.tsx"]
  n15["react/primitives.tsx"]
  n12 --> n11
  n12 --> n13
  n12 --> n14
  n12 --> n15
  n14 --> n11
  n14 --> n13
  n14 --> n15
  n15 --> n11
  n15 --> n13
```

| Module | 跨層依賴 |
| --- | --- |
| `src/react/context.tsx` | `src/controller.ts` |
| `src/react/index.ts` | — |
| `src/react/messages.ts` | `src/types.ts` |
| `src/react/panel.tsx` | `src/password.ts`, `src/types.ts` |
| `src/react/primitives.tsx` | — |

## adapters

```mermaid
flowchart TD
  n0["adapters/better-auth.ts"]
  n1["adapters/hosted.ts"]
  n2["adapters/neon.ts"]
  n3["adapters/shared.ts"]
  n4["adapters/supabase.ts"]
  n0 --> n3
  n1 --> n3
  n2 --> n0
  n2 --> n3
  n4 --> n3
```

| Module | 跨層依賴 |
| --- | --- |
| `src/adapters/better-auth.ts` | `src/errors.ts`, `src/types.ts` |
| `src/adapters/hosted.ts` | `src/errors.ts`, `src/types.ts` |
| `src/adapters/neon.ts` | `src/errors.ts`, `src/types.ts` |
| `src/adapters/shared.ts` | `src/errors.ts`, `src/types.ts` |
| `src/adapters/supabase.ts` | `src/errors.ts`, `src/types.ts` |

## server

```mermaid
flowchart TD
  n16["server/guards.ts"]
  n17["server/index.ts"]
  n18["server/password.ts"]
  n19["server/recovery.ts"]
  n17 --> n16
  n17 --> n18
  n17 --> n19
```

| Module | 跨層依賴 |
| --- | --- |
| `src/server/guards.ts` | `src/errors.ts`, `src/types.ts` |
| `src/server/index.ts` | — |
| `src/server/password.ts` | `src/errors.ts`, `src/password.ts`, `src/types.ts` |
| `src/server/recovery.ts` | `src/errors.ts` |

## Exported declarations

| Symbol | Source |
| --- | --- |
| `BetterAuthAdapterOptions` | [src/adapters/better-auth.ts:54](../src/adapters/better-auth.ts#L54) |
| `BetterAuthClientPort` | [src/adapters/better-auth.ts:17](../src/adapters/better-auth.ts#L17) |
| `createBetterAuthAdapter` | [src/adapters/better-auth.ts:67](../src/adapters/better-auth.ts#L67) |
| `createClerkAdapter` | [src/adapters/hosted.ts:44](../src/adapters/hosted.ts#L44) |
| `createHostedAdapter` | [src/adapters/hosted.ts:11](../src/adapters/hosted.ts#L11) |
| `HostedAuthPort` | [src/adapters/hosted.ts:4](../src/adapters/hosted.ts#L4) |
| `createNeonAdapter` | [src/adapters/neon.ts:22](../src/adapters/neon.ts#L22) |
| `NeonOtpPort` | [src/adapters/neon.ts:16](../src/adapters/neon.ts#L16) |
| `emptySession` | [src/adapters/shared.ts:58](../src/adapters/shared.ts#L58) |
| `errorCode` | [src/adapters/shared.ts:26](../src/adapters/shared.ts#L26) |
| `isRecord` | [src/adapters/shared.ts:16](../src/adapters/shared.ts#L16) |
| `serviceError` | [src/adapters/shared.ts:19](../src/adapters/shared.ts#L19) |
| `ServiceResponse` | [src/adapters/shared.ts:3](../src/adapters/shared.ts#L3) |
| `sessionFromUser` | [src/adapters/shared.ts:31](../src/adapters/shared.ts#L31) |
| `validateAdapterPort` | [src/adapters/shared.ts:7](../src/adapters/shared.ts#L7) |
| `createSupabaseAdapter` | [src/adapters/supabase.ts:58](../src/adapters/supabase.ts#L58) |
| `SupabaseAdapterOptions` | [src/adapters/supabase.ts:48](../src/adapters/supabase.ts#L48) |
| `SupabaseAuthPort` | [src/adapters/supabase.ts:18](../src/adapters/supabase.ts#L18) |
| `publicError` | [src/boundary.ts:30](../src/boundary.ts#L30) |
| `publicFailure` | [src/boundary.ts:73](../src/boundary.ts#L73) |
| `publicOutcome` | [src/boundary.ts:86](../src/boundary.ts#L86) |
| `publicSession` | [src/boundary.ts:47](../src/boundary.ts#L47) |
| `publicSessionResult` | [src/boundary.ts:76](../src/boundary.ts#L76) |
| `githubOnly` | [src/config.ts:3](../src/config.ts#L3) |
| `MAX_TIMER_DELAY_MS` | [src/config.ts:2](../src/config.ts#L2) |
| `passwordOnly` | [src/config.ts:10](../src/config.ts#L10) |
| `safeRedirectPath` | [src/config.ts:71](../src/config.ts#L71) |
| `validateConfig` | [src/config.ts:17](../src/config.ts#L17) |
| `AuthController` | [src/controller.ts:744](../src/controller.ts#L744) |
| `createAuthController` | [src/controller.ts:56](../src/controller.ts#L56) |
| `AuthFailure` | [src/errors.ts:11](../src/errors.ts#L11) |
| `capture` | [src/errors.ts:64](../src/errors.ts#L64) |
| `failure` | [src/errors.ts:5](../src/errors.ts#L5) |
| `normalizeError` | [src/errors.ts:21](../src/errors.ts#L21) |
| `success` | [src/errors.ts:2](../src/errors.ts#L2) |
| `assessPassword` | [src/password.ts:50](../src/password.ts#L50) |
| `defaultPasswordPolicy` | [src/password.ts:7](../src/password.ts#L7) |
| `isEmail` | [src/password.ts:81](../src/password.ts#L81) |
| `normalizeEmail` | [src/password.ts:78](../src/password.ts#L78) |
| `resolvePasswordPolicy` | [src/password.ts:25](../src/password.ts#L25) |
| `AuthProvider` | [src/react/context.tsx:12](../src/react/context.tsx#L12) |
| `useAuth` | [src/react/context.tsx:43](../src/react/context.tsx#L43) |
| `useAuthController` | [src/react/context.tsx:37](../src/react/context.tsx#L37) |
| `AuthMessages` | [src/react/messages.ts:2](../src/react/messages.ts#L2) |
| `en` | [src/react/messages.ts:118](../src/react/messages.ts#L118) |
| `formatMessage` | [src/react/messages.ts:189](../src/react/messages.ts#L189) |
| `zhTW` | [src/react/messages.ts:49](../src/react/messages.ts#L49) |
| `AuthPanel` | [src/react/panel.tsx:69](../src/react/panel.tsx#L69) |
| `AuthPanelProps` | [src/react/panel.tsx:39](../src/react/panel.tsx#L39) |
| `AuthSlots` | [src/react/panel.tsx:30](../src/react/panel.tsx#L30) |
| `AuthView` | [src/react/panel.tsx:23](../src/react/panel.tsx#L23) |
| `AuthButton` | [src/react/primitives.tsx:16](../src/react/primitives.tsx#L16) |
| `AuthFeedback` | [src/react/primitives.tsx:150](../src/react/primitives.tsx#L150) |
| `AuthField` | [src/react/primitives.tsx:42](../src/react/primitives.tsx#L42) |
| `AuthFieldProps` | [src/react/primitives.tsx:37](../src/react/primitives.tsx#L37) |
| `AuthGate` | [src/react/primitives.tsx:258](../src/react/primitives.tsx#L258) |
| `AuthStatus` | [src/react/primitives.tsx:198](../src/react/primitives.tsx#L198) |
| `LoadingIcon` | [src/react/primitives.tsx:13](../src/react/primitives.tsx#L13) |
| `PasswordField` | [src/react/primitives.tsx:74](../src/react/primitives.tsx#L74) |
| `SignOutButton` | [src/react/primitives.tsx:177](../src/react/primitives.tsx#L177) |
| `assertAllowedMethod` | [src/server/guards.ts:17](../src/server/guards.ts#L17) |
| `assertTrustedOrigin` | [src/server/guards.ts:4](../src/server/guards.ts#L4) |
| `enforceRateLimit` | [src/server/guards.ts:40](../src/server/guards.ts#L40) |
| `RateLimiter` | [src/server/guards.ts:32](../src/server/guards.ts#L32) |
| `RateLimitFailure` | [src/server/guards.ts:52](../src/server/guards.ts#L52) |
| `hashPassword` | [src/server/password.ts:37](../src/server/password.ts#L37) |
| `ServerPasswordOptions` | [src/server/password.ts:15](../src/server/password.ts#L15) |
| `validateNewPassword` | [src/server/password.ts:20](../src/server/password.ts#L20) |
| `verifyPassword` | [src/server/password.ts:46](../src/server/password.ts#L46) |
| `consumeRecoveryToken` | [src/server/recovery.ts:37](../src/server/recovery.ts#L37) |
| `digestRecoveryToken` | [src/server/recovery.ts:14](../src/server/recovery.ts#L14) |
| `issueRecoveryToken` | [src/server/recovery.ts:17](../src/server/recovery.ts#L17) |
| `RecoveryRecord` | [src/server/recovery.ts:4](../src/server/recovery.ts#L4) |
| `RecoveryStore` | [src/server/recovery.ts:9](../src/server/recovery.ts#L9) |
| `AuthAction` | [src/types.ts:111](../src/types.ts#L111) |
| `AuthAdapter` | [src/types.ts:63](../src/types.ts#L63) |
| `AuthCapabilities` | [src/types.ts:55](../src/types.ts#L55) |
| `AuthConfig` | [src/types.ts:149](../src/types.ts#L149) |
| `AuthError` | [src/types.ts:25](../src/types.ts#L25) |
| `AuthErrorCode` | [src/types.ts:13](../src/types.ts#L13) |
| `AuthEvent` | [src/types.ts:144](../src/types.ts#L144) |
| `AuthMethods` | [src/types.ts:81](../src/types.ts#L81) |
| `AuthOperation` | [src/types.ts:120](../src/types.ts#L120) |
| `AuthOutcome` | [src/types.ts:29](../src/types.ts#L29) |
| `AuthRefreshOptions` | [src/types.ts:139](../src/types.ts#L139) |
| `AuthResult` | [src/types.ts:35](../src/types.ts#L35) |
| `AuthSession` | [src/types.ts:8](../src/types.ts#L8) |
| `AuthSnapshot` | [src/types.ts:133](../src/types.ts#L133) |
| `AuthUser` | [src/types.ts:2](../src/types.ts#L2) |
| `Delivery` | [src/types.ts:12](../src/types.ts#L12) |
| `EmailVerification` | [src/types.ts:51](../src/types.ts#L51) |
| `PasswordAssessment` | [src/types.ts:107](../src/types.ts#L107) |
| `PasswordCredentials` | [src/types.ts:38](../src/types.ts#L38) |
| `PasswordIssue` | [src/types.ts:98](../src/types.ts#L98) |
| `PasswordPolicy` | [src/types.ts:88](../src/types.ts#L88) |
| `PasswordReset` | [src/types.ts:45](../src/types.ts#L45) |
| `Provider` | [src/types.ts:77](../src/types.ts#L77) |
| `Registration` | [src/types.ts:42](../src/types.ts#L42) |
