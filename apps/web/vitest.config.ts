import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Excluded from default run due to heap OOM when loaded alongside
      // other tests. Run separately with: pnpm --filter web test:pages
      "**/workspaces/**/page.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
