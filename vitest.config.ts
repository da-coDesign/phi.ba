import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "apps/**/*.test.ts", "packages/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@phi-ba/contracts": "/Users/fibabanka/phi.ba-repo/packages/contracts/src/index.ts",
      "@phi-ba/shared": "/Users/fibabanka/phi.ba-repo/packages/shared/src/index.ts"
    }
  }
});
