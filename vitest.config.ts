import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Chi quet __tests__/ (5 file moi tu zip nang cap) - loai lib/__tests__/
    // vi 3 file trong do dung quy uoc console.log rieng, khong phai Vitest suite that.
    include: ["__tests__/**/*.test.ts"],
  },
});
