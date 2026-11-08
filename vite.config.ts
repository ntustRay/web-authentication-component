import { defineConfig } from "vite";
export default defineConfig({
  root: "examples/playground",
  plugins: [
    {
      name: "spa-only-client-directive",
      enforce: "pre",
      transform(code, id) {
        if (id.replaceAll("\\", "/").includes("/src/react/"))
          return { code: code.replace(/^"use client";/m, ""), map: null };
        return null;
      },
    },
  ],
  build: { outDir: "../../demo-dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
});
