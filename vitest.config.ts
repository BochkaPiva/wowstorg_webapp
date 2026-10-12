import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Vercel invokes the quality gate with NODE_ENV=production. React's DOM
    // test helpers require its development build; never change the app build env.
    env: { NODE_ENV: "test" },
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
