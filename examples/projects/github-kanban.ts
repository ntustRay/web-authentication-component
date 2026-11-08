import {
  type BetterAuthClientPort,
  createBetterAuthAdapter,
} from "../../src/adapters/better-auth.js";
import { githubOnly } from "../../src/config.js";
import { createAuthController } from "../../src/controller.js";
export function createKanbanAuth(client: BetterAuthClientPort) {
  return createAuthController({
    methods: githubOnly,
    adapter: createBetterAuthAdapter(client, {
      providers: ["github"],
      callbackUrl: "/",
      errorCallbackUrl: "/?auth_error=1",
      recoveryUrl: "/",
    }),
  });
}
