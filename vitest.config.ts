import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests only — pure functions, no DB and no network. The `@/` alias has to
// be repeated here because vitest does not read tsconfig paths on its own.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
