import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".venv*/**",
    ".data/**",
    "Faith-office/**",
    ".cursor/**",
    ".local-wip/**",
    ".playwright-cli/**",
    "ml/**",
  ]),
  {
    // Next's React compiler diagnostics are useful during refactors, but the
    // product currently has intentional polling, preview fixtures, and
    // effect-driven data loading. Keep these visible without blocking the
    // repository-wide lint gate until those paths are migrated.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
