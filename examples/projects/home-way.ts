import {
  createClerkAdapter,
  type HostedAuthPort,
} from "../../src/adapters/hosted.js";
import { createAuthController } from "../../src/controller.js";
export function createHomeWayAuth(
  port: Omit<HostedAuthPort, "openSignIn"> & { openSignIn(): Promise<void> },
) {
  return createAuthController({
    methods: {
      password: false,
      registration: false,
      recovery: false,
      verification: false,
      providers: [{ id: "clerk", label: "會員帳號" }],
    },
    adapter: createClerkAdapter(port),
  });
}
