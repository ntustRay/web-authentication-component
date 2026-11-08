import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createAuthController, githubOnly, success } from "../dist/index.js";
import { AuthPanel, AuthProvider } from "../dist/react/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
for (const entry of Object.values(pkg.exports)) {
  if (typeof entry === "string") await access(resolve(root, entry));
  else {
    await access(resolve(root, entry.import));
    await access(resolve(root, entry.types));
  }
}
const adapter = {
  id: "smoke",
  capabilities: {
    password: false,
    registration: false,
    recovery: false,
    verification: false,
    providers: ["github"],
  },
  getSession: async () => success(null),
  signOut: async () => success({ kind: "complete" }),
  signInWithProvider: async () => success({ kind: "redirecting" }),
};
const controller = createAuthController({ adapter, methods: githubOnly });
const html = renderToString(
  createElement(AuthProvider, { controller }, createElement(AuthPanel)),
);
assert.match(html, /GitHub/);
assert.doesNotMatch(html, /type="password"/);
for (const name of ["supabase", "better-auth", "neon", "hosted"])
  await import(new URL(`../dist/adapters/${name}.js`, import.meta.url));
const server = await import("../dist/server/index.js");
assert.equal(typeof server.hashPassword, "function");
assert.equal(
  pkg.dependencies,
  undefined,
  "The library must not acquire hidden runtime dependencies",
);
for (const file of ["index", "context", "panel", "primitives"])
  assert.match(
    await readFile(resolve(root, `dist/react/${file}.js`), "utf8"),
    /^"use client";/,
  );
console.log(
  "All published entrypoints resolve; SSR works; client boundaries and zero runtime dependencies verified.",
);
