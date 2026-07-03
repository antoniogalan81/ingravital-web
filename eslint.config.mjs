import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Convención estándar: un guion bajo inicial marca variables/argumentos/errores
  // intencionadamente sin usar (p.ej. destructuring para "quitar" campos). Evita
  // ruido de lint sin ocultar variables realmente olvidadas (esas no llevan `_`).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // E2E preparado (Playwright): no forma parte del build de la app y su dependencia
    // (@playwright/test) no se instala por defecto. Ver e2e/README.md.
    "e2e/**",
  ]),
]);

export default eslintConfig;
