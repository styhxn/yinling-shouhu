import { defineConfig } from "vitest/config";
import path from "node:path";

const sharedSrc = path.resolve(__dirname, "../../packages/shared/src/index.ts");
const adaptersSrc = path.resolve(__dirname, "../../packages/adapters/src/index.ts");

export default defineConfig({
  resolve: {
    alias: {
      "@eha/shared": sharedSrc,
      "@eha/adapters": adaptersSrc
    }
  },
  ssr: {
    external: ["node:sqlite"]
  },
  test: {
    environment: "node",
    server: {
      deps: {
        external: ["node:sqlite"]
      }
    }
  }
});
