import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { requireAuth } from "../services/auth/rbac.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export const uploadRoutes: FastifyPluginAsync = async (server) => {
  server.post("/", { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: "invalid_body", message: "请选择文件" });
    }
    if (!ALLOWED.has(file.mimetype)) {
      return reply.code(415).send({ error: "unsupported_media_type", message: "仅支持 JPG/PNG/WebP" });
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return reply.code(413).send({ error: "payload_too_large", message: "图片不能超过 10MB" });
    }

    const meta = await sharp(buffer).metadata().catch(() => null);
    if (!meta?.width || !meta?.height) {
      return reply.code(400).send({ error: "invalid_body", message: "图片无法识别" });
    }

    const normalized = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const outMeta = await sharp(normalized).metadata();

    const id = `up_${crypto.randomUUID()}`;
    const filename = `${id}.webp`;
    await fs.mkdir(server.config.uploadsDir, { recursive: true });
    await fs.writeFile(path.join(server.config.uploadsDir, filename), normalized);

    const kindField = (file.fields as any)?.kind;
    const kind = typeof kindField?.value === "string" ? kindField.value : "scam";
    const sha256 = crypto.createHash("sha256").update(normalized).digest("hex");
    const user = req.user!;

    const upload = await server.db.uploads.create({
      id,
      ownerUserId: user.userId,
      elderId: user.elderId ?? null,
      kind,
      path: filename,
      mime: "image/webp",
      size: normalized.byteLength,
      width: outMeta.width ?? null,
      height: outMeta.height ?? null,
      sha256
    });

    return {
      upload: {
        id: upload.id,
        url: `/public/uploads/${filename}`,
        mime: upload.mime,
        width: upload.width,
        height: upload.height,
        size: upload.size
      }
    };
  });
};
