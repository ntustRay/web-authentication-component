import {
  createSupabaseAdapter,
  type SupabaseAuthPort,
} from "../../src/adapters/supabase.js";
import { passwordOnly } from "../../src/config.js";
import { createAuthController } from "../../src/controller.js";
/** The host creates its @supabase/ssr browser client and retains server callbacks/proxy/RLS. */
export function createStockPlatformAuth(
  auth: SupabaseAuthPort<"github">,
  siteOrigin: string,
) {
  return createAuthController({
    methods: passwordOnly,
    adapter: createSupabaseAdapter(auth, {
      providers: [],
      password: true,
      registration: true,
      recovery: true,
      verification: true,
      callbackUrl: new URL(
        "/auth/callback?next=/account&intent=signup",
        siteOrigin,
      ).href,
      recoveryUrl: new URL(
        "/auth/callback?next=/auth/update-password&intent=recovery",
        siteOrigin,
      ).href,
    }),
  });
}
