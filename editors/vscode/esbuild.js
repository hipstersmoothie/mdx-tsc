// Bundles the extension and the mdx-tsc language server into self-contained
// CommonJS files so the .vsix carries no node_modules. `vscode` is provided by
// the host; everything else (Volar, the mdx-tsc server, TypeScript) is inlined.
const esbuild = require("esbuild");

const production = process.argv.includes("--production");

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // `vscode` is injected by the host. The extension spawns the server as a
  // child process and only `require.resolve`s it as a source-mode fallback, so
  // leave that specifier unbundled.
  external: ["vscode", "mdx-tsc/language-server"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

async function main() {
  await Promise.all([
    esbuild.build({
      ...common,
      entryPoints: ["src/extension.ts"],
      outfile: "dist/extension.js",
    }),
    esbuild.build({
      ...common,
      // The server export resolves to the built mdx-tsc package.
      entryPoints: [require.resolve("mdx-tsc/language-server")],
      outfile: "dist/server.js",
    }),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
