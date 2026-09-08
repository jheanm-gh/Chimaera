// @ts-check
import tseslint from "typescript-eslint";

/**
 * Two rules here are load-bearing for the design, not style preferences:
 *
 *  1. `Math.random` is banned in the simulation packages — genetics, game and
 *     audio. Every random draw must come from the injected seeded Rng, or Daily
 *     Genome, replays, shareable genome codes and the determinism tests all
 *     quietly break. Audio is in the list because a voice is a phenotype: the
 *     same animal has to sound the same forever.
 *  2. `packages/genetics` may not import from any other package. The genetics
 *     engine is the product; it stays runnable headless with zero knowledge of
 *     rendering, game state or UI.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.d.ts"] },
  ...tseslint.configs.recommended,
  {
    files: ["packages/genetics/**/*.ts", "packages/game/**/*.ts", "packages/audio/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "Use the injected seeded Rng. Math.random() destroys determinism (Daily Genome, replays, tests).",
        },
      ],
    },
  },
  {
    files: ["packages/genetics/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@chimaera/*", "**/packages/*"],
              message:
                "packages/genetics is the pure core and must not depend on any other package.",
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
