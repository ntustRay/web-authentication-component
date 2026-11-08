"use client";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { AuthController } from "../controller.js";

const Context = createContext<AuthController | null>(null);
export function AuthProvider({
  controller,
  children,
}: {
  controller: AuthController;
  children: ReactNode;
}) {
  useEffect(() => {
    const stop = controller.start();
    const refresh = () => {
      void controller.refresh({ background: true });
    };
    window.addEventListener("focus", refresh);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      stop();
    };
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useAuthController(): AuthController {
  const controller = useContext(Context);
  if (!controller)
    throw new Error("Wrap authentication components in <AuthProvider>");
  return controller;
}
export function useAuth() {
  const controller = useAuthController();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  return { ...controller, state };
}
