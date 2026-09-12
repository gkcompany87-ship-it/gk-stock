import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
export default tseslint.config(
 { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**", "**/generated/**", "**/.offline-build/**", "pnpm-lock.yaml"] },
 js.configs.recommended,
 ...tseslint.configs.recommended,
 { languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.serviceworker } },
   rules: { "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
 { files: ["**/*.mjs", "**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } }
);
