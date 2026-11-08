# Web Authentication Component

This repository is a reusable npm library. Read README.md, docs/API.md and docs/ARCHITECTURE.md before changing a contract. Text files are UTF-8.

## Commands

- Bun 1.4.4, Node >=22. `bun install --frozen-lockfile`.
- `bun run verify`: Biome, strict TypeScript, behavioral tests, ESM/declaration build, graph freshness, built-entry smoke test and playground production build.
- After source edits: `bun run format`, then `bun run graph`, then `bun run verify`. Graph line references change after formatting.
- `bun run dev` opens the mock playground. Demo authentication is never production authentication.

## Where to change

| Request                         | Edit                                                   | Validate                                                |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Add login provider/service      | src/adapters, src/types.ts if necessary                | adapters tests + real SDK type fixture                  |
| Enable/disable methods          | host configuration, src/config.ts for new presets      | config/controller tests + actual server setting         |
| Change password rules           | src/password.ts, server/identity-service configuration | password/server tests; existing sign-in must still work |
| Change public data sanitization | src/boundary.ts                                        | extra-field stripping, immutable snapshots and results  |
| Change async/session behavior   | src/controller.ts                                      | race, unsubscribe, timeout and identity tests           |
| Add view/input                  | src/react/panel.tsx, primitives.tsx, messages.ts       | React behavior, labels, focus, reduced motion           |
| Change appearance               | src/styles.css; CSS variables or slots at host         | desktop/mobile and keyboard inspection                  |
| Change a public export          | src entry, package.json, docs/API.md                   | build + dist smoke + package dry run                    |

## Boundaries

- Core must not import React, identity SDKs, Node-only code, browser storage or host app modules.
- React uses the controller; adapters alone translate service protocols. Preserve Neon's Managed SDK and Supabase PKCE callback flow.
- Service SDKs are dev-only contract fixtures, not runtime dependencies. Add optional peers only when necessary.
- Server-only crypto lives behind the /server export. No browser import may reach it.
- Do not store passwords, confirmation, OTP, reset token or provider/access tokens in controller snapshots, telemetry, URLs or storage. Component-local input state is transient.
- Never trim/normalize an existing password. New password policy runs on signup/reset and on the server. Do not claim client validation or AuthGate is authorization.
- getSession must verify through the identity server. Email verification cannot come from editable metadata.
- Ignore stale async work after identity changes/unmount; do not resurrect a signed-out identity. A timeout retains the actual SDK mutation barrier; queued signOut must still execute after unmount.
- Background focus/visibility/SDK reads call refresh({ background: true }); refresh() is an explicit user retry. Failed/timed-out signOut keeps the old identity hidden, including all identities when its user ID was unknown.
- AuthPanel async handlers belong to their controller/view/reset-token scope. Clear secret inputs when that scope changes. Shared operation errors may focus only the initiating panel.
- Public errors use known codes. Email recovery/registration must not reveal whether an account exists. Server response timing is the host's responsibility.
- Server rate limits, CSRF/origin checks, OAuth state/PKCE, secure cookies, session revocation and row ownership stay mandatory at the host/provider. UI toggles cannot disable server routes.
- Keep project examples generic. Never copy private app business code, credentials, environment files or real user data here.
- No real email sends, account migration, provider changes, or production auth cutover just to run package tests.

## Delivery

Keep docs/code-graph.json and docs/CODE_GRAPH.md generated from source. Do not hand-edit them. Do not commit dist/node_modules/secrets. npm publish requires a valid publishing identity and the documented initial setup. Report package delivery, live app migration and npm publication separately.
