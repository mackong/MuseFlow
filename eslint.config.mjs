import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tailwindPlugin from "eslint-plugin-tailwindcss";
import globals from "globals";

/**
 * ESLint flat config for MuseFlow.
 *
 * Constitution Principle VIII (Model-Provider Flexibility) requires that the
 * `openai` SDK is imported only from `src/server/services/ai/`. The
 * `no-restricted-imports` rule below enforces this everywhere, and is then
 * relaxed exclusively in that directory by an override block at the bottom.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  // Files to ignore entirely
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "dist/",
      "build/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "next-env.d.ts",
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // Repo-wide TypeScript + React rules
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        React: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooks,
      tailwindcss: tailwindPlugin,
    },
    settings: {
      react: { version: "detect" },
      tailwindcss: { callees: ["clsx", "cn", "tw"], config: "./tailwind.config.ts" },
    },
    rules: {
      // TypeScript
      // Base no-unused-vars doesn't understand TS interface params or type-only
      // imports; defer entirely to @typescript-eslint/no-unused-vars.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",

      // React
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Tailwind
      // `tailwindcss/classnames-order` is intentionally OFF: under pnpm's
      // strict node_modules layout the plugin can't resolve `tailwindcss`,
      // and `prettier-plugin-tailwindcss` already enforces class ordering on
      // format. Re-enable if upstream fixes the resolution path.
      "tailwindcss/classnames-order": "off",
      "tailwindcss/no-custom-classname": "off",

      // Constitution Principle VIII gate:
      // Forbid direct `openai` import outside the AI provider directory.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "openai",
              message:
                "Import only from src/server/services/ai/. All other code must depend on the AIProvider interface (Constitution v2.0.0 Principle VIII).",
            },
          ],
          patterns: [
            {
              group: ["openai/*"],
              message:
                "Subpath imports of `openai` are also restricted to src/server/services/ai/.",
            },
          ],
        },
      ],

      // Disallow business logic in page/route files: lint hint via comment in
      // those files; the actual gate is enforced by review (see plan.md).
    },
  },

  // Allow `openai` SDK imports only inside the AI provider directory.
  // This is the single, narrow exception to the rule above.
  {
    files: ["src/server/services/ai/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  // Test files: relax a couple of rules for ergonomics.
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
