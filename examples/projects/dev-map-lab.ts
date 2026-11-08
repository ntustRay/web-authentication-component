import {
  type BetterAuthAdapterOptions,
  type BetterAuthClientPort,
} from "../../src/adapters/better-auth.js";
import {
  createNeonAdapter,
  type NeonOtpPort,
} from "../../src/adapters/neon.js";
import { passwordOnly } from "../../src/config.js";
import { createAuthController } from "../../src/controller.js";
/** Keep the app's verified-session and account-workspace bridge. Do not expose cached user metadata. */
export function createLearningAuth(
  client: BetterAuthClientPort,
  otp: NeonOtpPort,
  options: BetterAuthAdapterOptions,
) {
  return createAuthController({
    methods: {
      ...passwordOnly,
      providers: options.providers.map((id) => ({
        id,
        label: id === "github" ? "GitHub" : id === "google" ? "Google" : id,
      })),
    },
    adapter: createNeonAdapter(client, otp, {
      ...options,
      password: true,
      registration: true,
      verification: true,
      recovery: true,
    }),
    passwordPolicy: { maxUtf8Bytes: 72 },
  });
}
