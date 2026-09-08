import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = (name: string): string =>
  fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    // Dev and build both run against package sources, so a stale dist can never
    // make the app disagree with the tests.
    alias: {
      "@chimaera/genetics": source("genetics"),
      "@chimaera/rendering": source("rendering"),
      "@chimaera/audio": source("audio"),
      "@chimaera/game": source("game"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
