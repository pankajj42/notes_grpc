import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["vitest.config.ts", "eslint.config.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: [
      "apps/auth-service/src/config.ts",
      "apps/auth-service/src/server.ts",
      "apps/auth-service/src/index.ts",
      "apps/notes-service/src/config.ts",
      "apps/notes-service/src/server.ts",
      "apps/notes-service/src/index.ts",
      "apps/gateway/src/config.ts",
      "apps/gateway/src/server.ts",
      "apps/gateway/src/index.ts",
    ],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
    ],
  }
);