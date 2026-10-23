import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: {
      SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
      // Integration tests run against TEST_DATABASE_URL only; never the dev database.
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
    fileParallelism: false,
  },
});
