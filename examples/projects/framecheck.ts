import {
  createSupabaseAdapter,
  type SupabaseAuthPort,
} from "../../src/adapters/supabase.js";
import { githubOnly } from "../../src/config.js";
import { createAuthController } from "../../src/controller.js";
export function createFramecheckAuth(
  auth: SupabaseAuthPort<"github">,
  siteOrigin: string,
) {
  return createAuthController({
    methods: githubOnly,
    adapter: createSupabaseAdapter(auth, {
      providers: ["github"],
      callbackUrl: new URL("/auth/callback", siteOrigin).href,
      recoveryUrl: new URL("/login", siteOrigin).href,
    }),
  });
}
