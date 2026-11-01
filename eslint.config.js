export default [
  {
    files: ["web/app.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        TextDecoder: "readonly",
        AbortController: "readonly",
        navigator: "readonly",
        console: "readonly",
        process: "readonly",
        Promise: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Date: "readonly",
        Object: "readonly",
        Array: "readonly",
        String: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
];
