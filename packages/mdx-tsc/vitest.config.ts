import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // The CLI spawns real tsc over fixture projects; give it room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
