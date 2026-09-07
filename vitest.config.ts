import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // The Mendelian-ratio suites breed tens of thousands of pairs; give them room.
    testTimeout: 60_000,
  },
});
