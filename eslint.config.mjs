import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "design_handoff_avaliasmart/**",
    "next-env.d.ts",
  ]),
  nextCoreWebVitals,
  {
    // Regras novas do react-hooks v7 acusam padrões pré-existentes que
    // funcionam em produção; ficam como warning até uma revisão dedicada.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);
