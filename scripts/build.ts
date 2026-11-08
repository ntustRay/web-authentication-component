import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const base = resolve(import.meta.dir, "..");
const file = ts.readConfigFile(
  resolve(base, "tsconfig.build.json"),
  ts.sys.readFile,
);
const config = ts.parseJsonConfigFileContent(file.config, ts.sys, base);
const program = ts.createProgram(config.fileNames, config.options);
const result = program.emit();
const diagnostics = [
  ...ts.getPreEmitDiagnostics(program),
  ...result.diagnostics,
];
if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => base,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
await mkdir(resolve(base, "dist"), { recursive: true });
await cp(resolve(base, "src/styles.css"), resolve(base, "dist/styles.css"));
// tsc preserves the use-client boundary and module structure; no bundler erases it.
for (const name of ["index", "context", "panel", "primitives"]) {
  const target = resolve(base, `dist/react/${name}.js`);
  const content = await readFile(target, "utf8");
  if (!content.startsWith('"use client";'))
    throw new Error(`Missing client boundary: ${target}`);
}
await writeFile(
  resolve(base, "dist/package.json"),
  `${JSON.stringify({ type: "module" })}\n`,
  "utf8",
);
console.log("Built ESM, declarations, source maps and opt-in CSS.");
