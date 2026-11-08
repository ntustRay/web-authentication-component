import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dir, "..");
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(resolve(directory, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [resolve(directory, entry.name)]
          : [],
    ),
  );
  return groups.flat().sort();
}
const paths = await files(resolve(root, "src"));
const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile).config,
  ts.sys,
  root,
);
const program = ts.createProgram(paths, config.options);
const checker = program.getTypeChecker();
const slash = (path: string) => path.replaceAll("\\", "/");
const id = (path: string) => slash(relative(root, path));
interface GraphNode {
  id: string;
  kind: string;
  name: string;
  file: string;
  line: number;
  exported: boolean;
}
interface GraphEdge {
  from: string;
  to: string;
  kind: "imports" | "reexports" | "declares" | "calls";
}
const nodes: GraphNode[] = [];
const edges: GraphEdge[] = [];
const declarations = new Map<ts.Node, string>();
function exportedVariable(node: ts.Node): boolean {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent) &&
    (ts
      .getModifiers(node.parent.parent)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}
const sourceFiles = paths
  .map((path) => program.getSourceFile(path))
  .filter((source): source is ts.SourceFile => !!source);
for (const source of sourceFiles) {
  const file = id(source.fileName);
  nodes.push({
    id: file,
    kind: "module",
    name: file,
    file,
    line: 1,
    exported: true,
  });
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      (ts.isVariableDeclaration(node) &&
        node.initializer &&
        (exportedVariable(node) ||
          ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer)))
    ) {
      const name = node.name?.getText(source);
      if (name) {
        const line =
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const symbolId = `${file}#${name}:${line}`;
        const modifiers = ts.canHaveModifiers(node)
          ? ts.getModifiers(node)
          : undefined;
        const exported =
          (exportedVariable(node) ||
            modifiers?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            )) ??
          false;
        nodes.push({
          id: symbolId,
          name,
          file,
          line,
          kind: ts.isInterfaceDeclaration(node)
            ? "interface"
            : ts.isTypeAliasDeclaration(node)
              ? "type"
              : ts.isClassDeclaration(node)
                ? "class"
                : exportedVariable(node) &&
                    ts.isVariableDeclaration(node) &&
                    node.initializer &&
                    !ts.isArrowFunction(node.initializer) &&
                    !ts.isFunctionExpression(node.initializer)
                  ? "constant"
                  : "function",
          exported,
        });
        declarations.set(node, symbolId);
        edges.push({ from: file, to: symbolId, kind: "declares" });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const source of sourceFiles) {
  const file = id(source.fileName);
  function visit(node: ts.Node, owner: string) {
    const current = declarations.get(node) ?? owner;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith(".")) {
        const target = ts.resolveModuleName(
          specifier,
          source.fileName,
          config.options,
          ts.sys,
        ).resolvedModule;
        if (target && id(target.resolvedFileName).startsWith("src/"))
          edges.push({
            from: file,
            to: id(target.resolvedFileName),
            kind: ts.isImportDeclaration(node) ? "imports" : "reexports",
          });
      }
    }
    if (ts.isCallExpression(node)) {
      let symbol = checker.getSymbolAtLocation(node.expression);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias)
        symbol = checker.getAliasedSymbol(symbol);
      for (const declaration of symbol?.declarations ?? []) {
        const target = declarations.get(declaration);
        if (target && target !== current)
          edges.push({ from: current, to: target, kind: "calls" });
      }
    }
    ts.forEachChild(node, (child) => visit(child, current));
  }
  visit(source, file);
}
const sortedNodes = nodes.sort((a, b) => a.id.localeCompare(b.id));
const sortedEdges = [
  ...new Map(
    edges.map((edge) => [`${edge.kind}:${edge.from}:${edge.to}`, edge]),
  ).values(),
].sort((a, b) =>
  `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`),
);
const graph = {
  schemaVersion: 1,
  description:
    "TypeScript compiler-derived modules, declarations and statically resolvable calls. Dynamic dispatch/callbacks are not a complete runtime call graph.",
  nodes: sortedNodes,
  edges: sortedEdges,
};
let markdown =
  "# Code graph\n\n由 TypeScript compiler API 從 `src/` 產生；執行 `bun run graph` 更新。JSON 同時包含宣告與可靜態解析的 function calls；callback、動態 adapter dispatch 與 runtime data flow 需配合 [ARCHITECTURE.md](ARCHITECTURE.md) 閱讀。\n\n";
const moduleNodes = sortedNodes.filter((node) => node.kind === "module");
const labels = new Map(
  moduleNodes.map((node, index) => [node.id, `n${index}`]),
);
for (const group of ["core", "react", "adapters", "server"]) {
  const own = moduleNodes.filter((node) =>
    group === "core"
      ? dirname(node.file) === "src"
      : dirname(node.file) === `src/${group}`,
  );
  const ownIds = new Set(own.map((node) => node.id));
  markdown += `## ${group}\n\n\`\`\`mermaid\nflowchart TD\n`;
  for (const node of own)
    markdown += `  ${labels.get(node.id)}["${node.file.replace(/^src\//, "")}"]\n`;
  for (const edge of sortedEdges.filter(
    (edge) =>
      ["imports", "reexports"].includes(edge.kind) &&
      ownIds.has(edge.from) &&
      ownIds.has(edge.to),
  ))
    markdown += `  ${labels.get(edge.from)} --> ${labels.get(edge.to)}\n`;
  markdown += "```\n\n| Module | 跨層依賴 |\n| --- | --- |\n";
  for (const node of own) {
    const external = sortedEdges
      .filter(
        (edge) =>
          ["imports", "reexports"].includes(edge.kind) &&
          edge.from === node.id &&
          !ownIds.has(edge.to),
      )
      .map((edge) => `\`${edge.to}\``);
    markdown += `| \`${node.file}\` | ${external.join(", ") || "—"} |\n`;
  }
  markdown += "\n";
}
markdown += `## Exported declarations\n\n| Symbol | Source |\n| --- | --- |\n${sortedNodes
  .filter((node) => node.exported && node.kind !== "module")
  .map(
    (node) =>
      `| \`${node.name}\` | [${node.file}:${node.line}](../${node.file}#L${node.line}) |`,
  )
  .join("\n")}\n`;
await mkdir(resolve(root, "docs"), { recursive: true });
for (const [file, content] of [
  ["code-graph.json", `${JSON.stringify(graph, null, 2)}\n`],
  ["CODE_GRAPH.md", markdown],
]) {
  const target = resolve(root, "docs", file);
  if (process.argv.includes("--check")) {
    const actual = await readFile(target, "utf8").catch(() => "");
    if (actual !== content)
      throw new Error(`${file} is stale. Run bun run graph.`);
  } else await writeFile(target, content, "utf8");
}
console.log(
  `${moduleNodes.length} modules, ${sortedNodes.length} nodes, ${sortedEdges.length} edges.`,
);
