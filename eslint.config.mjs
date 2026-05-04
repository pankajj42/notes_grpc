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
      "apps/auth-service/src/**/*.ts",
      "apps/notes-service/src/**/*.ts",
      "apps/gateway/src/**/*.ts",
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