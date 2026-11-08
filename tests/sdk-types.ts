// Compiled by typecheck: actual installed SDKs must satisfy the public ports without casts.
import { createAuthClient as createNeonClient } from "@neon/neon-js/auth";
import { createClient } from "@supabase/supabase-js";
import { createAuthClient } from "better-auth/client";
import { createBetterAuthAdapter } from "../src/adapters/better-auth.js";
import { createNeonAdapter } from "../src/adapters/neon.js";
import { createSupabaseAdapter } from "../src/adapters/supabase.js";
export function compileSdkContracts() {
  const providers: ("github" | "google")[] = ["github"];
  const options = {
    providers,
    callbackUrl: "https://example.com/auth/callback",
    errorCallbackUrl: "https://example.com/login",
    recoveryUrl: "https://example.com/auth/reset",
  };
  const supabase = createClient(
    "https://example.supabase.co",
    "publishable-test-only",
  );
  const better = createAuthClient({ baseURL: "https://example.com" });
  const neon = createNeonClient("https://example.neon.tech/auth");
  return [
    createSupabaseAdapter(supabase.auth, options),
    createBetterAuthAdapter(better, options),
    createNeonAdapter(
      neon,
      { $fetch: (route, input) => neon.$fetch(route, input) },
      options,
    ),
  ];
}
