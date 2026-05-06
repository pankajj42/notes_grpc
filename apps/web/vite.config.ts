import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["source"],
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@mui") || id.includes("@emotion")) {
            return "mui-vendor";
          }

          if (id.includes("@tanstack")) {
            return "tanstack-vendor";
          }

          if (id.includes("zod") || id.includes("axios") || id.includes("zustand")) {
            return "core-vendor";
          }

          return "vendor";
        },
      },
    },
  },
});
