# Web Authentication Component

English · [繁體中文](https://github.com/ntustRay/web-authentication-component/blob/main/docs/README.zh-TW.md)

Add GitHub sign-in, email and password registration, or both to a React app. The panel, navigation bar and custom controls share one session. Your application keeps its identity provider, database, user IDs and authorization rules.

## Install

```sh
npm install @ntustray/web-authentication-component
# or
bun add @ntustray/web-authentication-component
```

ES modules, Node.js 22 or later. The UI supports React 18.3.1 and React 19. The core controller and server helpers can be used without React. Import the stylesheet once if you want the included theme.

## Quick start with GitHub and Better Auth

Configure GitHub as a provider in your Better Auth server and disable email/password there for GitHub-only access. The example uses the client from your application's `./auth-client` module.

```tsx
"use client";

import { useState } from "react";
import {
  createAuthController,
  githubOnly,
} from "@ntustray/web-authentication-component";
import { createBetterAuthAdapter } from "@ntustray/web-authentication-component/adapters/better-auth";
import {
  AuthPanel,
  AuthProvider,
  AuthStatus,
} from "@ntustray/web-authentication-component/react";
import "@ntustray/web-authentication-component/styles.css";
import { authClient } from "./auth-client";

export function Login() {
  const [controller] = useState(() =>
    createAuthController({
      methods: githubOnly,
      adapter: createBetterAuthAdapter(authClient, {
        providers: ["github"],
        callbackUrl: "/",
        errorCallbackUrl: "/login?error=oauth",
        recoveryUrl: "/login",
      }),
    }),
  );

  return (
    <AuthProvider controller={controller} locale="en">
      <AuthStatus />
      <AuthPanel />
    </AuthProvider>
  );
}
```

To share sign-in state across routes, put the provider in a shared client layout. Create the controller inside the client boundary when using React Server Components.

## Choose sign-in methods

| What the user can do                                        | Controller configuration                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sign in with GitHub                                         | `methods: githubOnly`                                                                        |
| Register, verify an email, sign in and recover a password   | `methods: passwordOnly`                                                                      |
| Sign in with a password or a social provider                | `methods: { ...passwordOnly, providers: [{ id: "github", label: "GitHub" }] }`               |
| Open a hosted sign-in modal or use another identity service | Use `createHostedAdapter` or implement `AuthAdapter` with the methods your service supports. |

Enable the same methods in the identity service and adapter. The controller rejects configurations the adapter cannot implement. Adapters are included for Supabase, Better Auth, Neon Managed Auth and hosted interfaces. [Integration examples](https://github.com/ntustRay/web-authentication-component/tree/main/examples/projects)

For email/password with Supabase, pass your browser client's `auth` object and callback URLs from trusted app configuration.

```ts
import {
  createAuthController,
  passwordOnly,
} from "@ntustray/web-authentication-component";
import { createSupabaseAdapter } from "@ntustray/web-authentication-component/adapters/supabase";

const controller = createAuthController({
  methods: passwordOnly,
  adapter: createSupabaseAdapter(supabase.auth, {
    providers: [],
    password: true,
    registration: true,
    verification: true,
    recovery: true,
    callbackUrl: new URL("/auth/callback", siteOrigin).href,
    recoveryUrl: new URL(
      "/auth/callback?next=/auth/update-password",
      siteOrigin,
    ).href,
  }),
});
```

Keep your PKCE callback and server session checks. Open `<AuthPanel initialView="reset-password" />` after the server validates the recovery callback.

## Languages

Set `locale` on `AuthProvider` to translate the whole sign-in flow, including status text, field validation, pending states and accessibility labels. The built-in catalogs are English (`en`), Traditional Chinese (`zh-TW`) and Japanese (`ja`). Omitting the locale preserves the Traditional Chinese default. Set it from your app's current language to switch at runtime.

```tsx
<AuthProvider
  controller={controller}
  locale="en"
  messages={{ errors: { unavailable: "Sign-in is temporarily unavailable." } }}
>
  <AuthStatus />
  <AuthPanel />
</AuthProvider>;
```

For another language, pass its language tag and your translations in `messages`. Missing entries for an unsupported language fall back to English. Keep placeholders such as `{min}`, `{seconds}` and `{provider}` in translated strings. Use `AuthLocaleProvider` to scope language settings to part of a page and `useAuthLocale()` to read them in your own components. The host controls provider names, custom notices and emails sent by the identity service.

## Passwords and sessions

New passwords accept **8–128 Unicode code points** by default. Spaces, pasted passwords and password managers are supported. Registration and reset check the confirmation field. Existing sign-ins retain the password exactly as entered. To require a different minimum, pass `passwordPolicy: { minLength: 15 }` to `createAuthController`. Optional rules cover uppercase, lowercase, numbers, symbols, a blocklist and a UTF-8 byte limit.

Enforce the same policy at the identity service or in your own server handler. The `/server` entry offers scrypt password hashing, origin and method checks, and interfaces for rate limiting and single-use recovery tokens. The host supplies the backing stores and verifies session ownership on every protected request. [Security responsibilities](https://github.com/ntustRay/web-authentication-component/blob/main/SECURITY.md)

## Customize the interface

Use the included light, dark or automatic theme, override CSS variables, or render your own controls with `useAuth()`. The panel includes loading indicators, feedback, focus management, resend cooldowns and reduced-motion support. Replace the header, footer, field renderer, provider icon or loading icon through `slots`.

```tsx
<AuthPanel
  theme="dark"
  className="product-auth"
  slots={{ header: <Logo />, footer: <Terms /> }}
/>;
```

## Playground and development

From a repository checkout, run `bun install --frozen-lockfile` and `bun run dev`. The playground uses in-memory accounts and the demo verification code `123456`. You can simulate delays, rate limits and failed requests. [Desktop preview](https://github.com/ntustRay/web-authentication-component/blob/main/docs/images/playground-desktop.png) · [Mobile preview](https://github.com/ntustRay/web-authentication-component/blob/main/docs/images/playground-mobile.png)

After changing source files, run `bun run format`, `bun run graph`, then `bun run verify`. Verification covers TypeScript, behavior tests, SDK interfaces, entry-point imports and the production playground build. Live OAuth, email delivery and app-specific authorization require testing against the host service.

[Public API](https://github.com/ntustRay/web-authentication-component/blob/main/docs/API.md) · [Architecture](https://github.com/ntustRay/web-authentication-component/blob/main/docs/ARCHITECTURE.md) · [Code graph](https://github.com/ntustRay/web-authentication-component/blob/main/docs/CODE_GRAPH.md) · [Machine-readable graph](https://github.com/ntustRay/web-authentication-component/blob/main/docs/code-graph.json) · [Agent editing guide](https://github.com/ntustRay/web-authentication-component/blob/main/AGENTS.md) · [Project migration notes](https://github.com/ntustRay/web-authentication-component/blob/main/docs/MIGRATION.md)
