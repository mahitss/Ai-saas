import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";

const disabledReactPluginRules = Object.fromEntries(
  Object.keys(reactPlugin.rules).map((ruleName) => [`react/${ruleName}`, "off"]),
);

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".vercel/**",
      ".kilo/**",
      "coverage/**",
      "eslint.config.mjs",
      "next-env.d.ts",
      "node_modules/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: disabledReactPluginRules,
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "integrations/**/*.js", "extensions/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
