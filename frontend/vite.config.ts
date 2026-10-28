import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

const sharedSrc = path.resolve(__dirname, "shared/index.ts");
const dhStaticRoot = path.resolve(
  __dirname,
  process.env.DH_LIVE_STATIC_DIR ?? "../DH_live-main/DH_live-main/web_demo/static"
);
function siblingApiPort(): number | null {
  try {
    const envPath = path.resolve(__dirname, "../apps/api/.env");
    if (!fs.existsSync(envPath)) return null;
    const match = fs.readFileSync(envPath, "utf8").match(/^\s*PORT\s*=\s*(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

const apiTarget =
  process.env.VITE_PROXY_TARGET ?? `http://127.0.0.1:${siblingApiPort() ?? 3100}`;
const wsTarget = apiTarget.replace(/^http/, "ws");
const dhMountPrefix = "/dh-live";

function contentTypeByExt(ext: string) {
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".gz") return "application/gzip";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".png") return "image/png";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

async function copyDir(src: string, dest: string) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await copyDir(from, to);
      continue;
    }
    if (ent.isFile()) {
      await fsp.mkdir(path.dirname(to), { recursive: true });
      await fsp.copyFile(from, to);
    }
  }
}

function dhLiveStatic() {
  let outDirAbs = path.resolve(__dirname, "dist");
  return {
    name: "dh-live-static",
    configResolved(config: any) {
      const outDir = config?.build?.outDir ?? "dist";
      outDirAbs = path.resolve(config.root, outDir);
    },
    configureServer(server: any) {
      server.middlewares.use(dhMountPrefix, async (req: any, res: any, next: any) => {
        try {
          const urlRaw = typeof req.url === "string" ? req.url : "/";
          const url = decodeURIComponent(urlRaw.split("?")[0] ?? "/");
          const rel = url === "/" || url === "" ? "/MiniLive_RealTime.html" : url;
          const target = path.normalize(path.join(dhStaticRoot, rel));
          const rootNorm = path.normalize(dhStaticRoot + path.sep);
          if (!target.startsWith(rootNorm)) return next();
          const st = await fsp.stat(target).catch(() => null);
          if (!st || !st.isFile()) return next();
          const ext = path.extname(target).toLowerCase();
          res.statusCode = 200;
          res.setHeader("content-type", contentTypeByExt(ext));
          fs.createReadStream(target).pipe(res);
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      const dest = path.join(outDirAbs, dhMountPrefix.replace(/^\//, ""));
      const st = await fsp.stat(dhStaticRoot).catch(() => null);
      if (!st?.isDirectory()) return;
      await copyDir(dhStaticRoot, dest);
    }
  };
}

export default defineConfig({
  plugins: [react(), dhLiveStatic()],
  resolve: {
    alias: {
      "@eha/shared": sharedSrc
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: false
      },
      "/health": {
        target: apiTarget,
        changeOrigin: false
      },
      "/public": {
        target: apiTarget,
        changeOrigin: false
      },
      "/ws": {
        target: wsTarget,
        ws: true
      },
      "/dh-live-api": {
        target: apiTarget,
        changeOrigin: true
      }
    },
    fs: {
      allow: [path.resolve(__dirname, ".")]
    }
  }
});
