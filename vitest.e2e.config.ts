import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@notes/grpc-clients": path.resolve("packages/grpc-clients/src/index.ts"),
      "@notes/shared-types": path.resolve("packages/shared-types/src/index.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
