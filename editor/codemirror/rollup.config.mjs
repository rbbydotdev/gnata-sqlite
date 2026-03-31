import { lezer } from "@lezer/generator/rollup"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import typescript from "@rollup/plugin-typescript"

export default {
  input: "src/index.ts",
  output: [
    { file: "dist/index.js", format: "es", sourcemap: true },
    { file: "dist/index.cjs", format: "cjs", sourcemap: true },
  ],
  external: (id) => /^@codemirror|^@lezer/.test(id),
  plugins: [
    lezer(),
    nodeResolve(),
    typescript({
      compilerOptions: {
        declaration: true,
        declarationDir: "dist",
        skipLibCheck: true,
        // Suppress TS2742 (inferred type not portable) and TS2307 (grammar import)
        noEmit: false,
      },
      noForceEmit: true,
    }),
  ],
}
