import { lezer } from "@lezer/generator/rollup"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import ts from "rollup-plugin-ts"

export default {
  input: "src/index.ts",
  output: [
    { file: "dist/index.js", format: "es", sourcemap: true },
    { file: "dist/index.cjs", format: "cjs", sourcemap: true },
  ],
  external: (id) => /^@codemirror|^@lezer/.test(id),
  plugins: [lezer(), nodeResolve(), ts()],
}
