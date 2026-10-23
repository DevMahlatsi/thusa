import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Provider-specific code stays behind src/payments/adapter.ts.
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/payments/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/payments/stitch*", "@/payments/fnb*", "**/payments/stitch*", "**/payments/fnb*"],
              message: "Import from @/payments/adapter instead. Provider types stay inside src/payments/.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "src/generated/**"]),
]);
