import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // SPEC §11.4: one data-access layer. Only src/lib/data and src/lib/db touch the database.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["src/lib/data/**", "src/lib/db/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/generated/prisma/client",
                "@/generated/prisma/internal/*",
                "@/generated/prisma/models/*",
                "@/lib/db/client",
                "**/generated/prisma/client*",
                "@prisma/client",
                "@prisma/client/*",
                "@prisma/adapter-better-sqlite3",
                "better-sqlite3",
              ],
              message:
                "Use the data-access layer (@/lib/data), never the database client directly.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      "reference_papers/**",
      "src/generated/**",
    ],
  },
];

export default config;
