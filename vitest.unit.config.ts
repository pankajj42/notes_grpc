import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["source", "node", "import", "default"],
    alias: {
      "@notes/shared-types": path.resolve("packages/shared-types/src/index.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: [
      "apps/**/src/**/*.unit.test.ts",
      "packages/**/src/**/*.unit.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
