import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The "@/..." alias mirrors compilerOptions.paths in tsconfig.json ("@/*" -> "./*").
const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
