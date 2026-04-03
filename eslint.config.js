import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,

  // Base TypeScript rules (includes no-explicit-any)
  ...tseslint.configs.recommended,

  // Type-aware rules (recommended for catching `as any`)
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true, // Modern & faster way (better than `project: true`)
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      semi: "error",
      "prefer-const": "error",

      // Make these strict
      "@typescript-eslint/no-explicit-any": "error",

      // ← This is the rule that fails the build on `as any` or `<any>`
      "@typescript-eslint/no-unsafe-type-assertion": "error",

      // Your other strict unsafe rules
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
    },
  },

  // Ignore folders
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/build/**",
      "**/.svelte-kit/**",
      "**/*.js",
      "**/*.mjs",
    ],
  },
);
