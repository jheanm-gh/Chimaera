import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageSource = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against package sources, so a stale dist can never make a
    // failing suite look green (or vice versa).
    alias: {
      "@chimaera/genetics": packageSource("genetics"),
      "@chimaera/rendering": packageSource("rendering"),
      "@chimaera/game": packageSource("game"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // The Mendelian-ratio suites breed tens of thousands of pairs; give them room.
    testTimeout: 60_000,
  },
});
