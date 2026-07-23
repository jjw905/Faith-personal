import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(__dirname, "../..");
const publicDir = path.resolve(repoRoot, "public");

/** POST /api/save-shot { shot, dataUrl, config? } → public/hero-chat-glass-XX.png */
function saveShotPlugin(): Plugin {
  return {
    name: "faith-save-glass-shot",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url !== "/api/save-shot") {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              shot?: number;
              dataUrl?: string;
              config?: unknown;
            };
            const shot = Math.min(9, Math.max(1, Number(body.shot) || 1));
            const id = String(shot).padStart(2, "0");
            const dataUrl = body.dataUrl ?? "";
            const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
            if (!m?.[1]) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "invalid dataUrl" }));
              return;
            }

            fs.mkdirSync(publicDir, { recursive: true });
            const pngPath = path.join(publicDir, `hero-chat-glass-${id}.png`);
            fs.writeFileSync(pngPath, Buffer.from(m[1], "base64"));

            if (body.config) {
              const jsonPath = path.join(
                publicDir,
                `hero-chat-glass-${id}.json`,
              );
              fs.writeFileSync(
                jsonPath,
                JSON.stringify({ shot, config: body.config }, null, 2),
              );
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: true,
                path: `public/hero-chat-glass-${id}.png`,
                abs: pngPath,
              }),
            );
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveShotPlugin()],
  root: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3001,
    strictPort: true,
  },
});
