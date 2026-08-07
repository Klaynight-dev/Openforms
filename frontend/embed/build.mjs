import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, "widget.ts")],
  outfile: resolve(__dirname, "../static/embed.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
  sourcemap: true,
  logLevel: "info",
});
