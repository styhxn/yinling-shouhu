import type { FastifyPluginAsync } from "fastify";
import { ProfileSchema } from "@eha/shared";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

export const profileRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async () => {
    return await server.store.getProfile();
  });

  server.put("/", async (req, reply) => {
    const parsed = ProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    await server.store.setProfile(parsed.data);
    server.eventBus.publish({
      type: "profile.updated",
      ts: Date.now(),
      payload: { profile: parsed.data }
    });
    return parsed.data;
  });

  server.post("/avatar", async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: "no_file" });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.status(400).send({ error: "invalid_file_type" });
    }

    const uploadId = `${Date.now()}_${randomUUID()}`;
    const publicDir = path.resolve(process.cwd(), "public/uploads");

    const buffer = await data.toBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return reply.status(400).send({ error: "file_too_large" });
    }

    const meta = await sharp(buffer).metadata().catch(() => null);
    const width = typeof meta?.width === "number" ? meta.width : null;
    const height = typeof meta?.height === "number" ? meta.height : null;
    if (!width || !height) {
      return reply.status(400).send({ error: "invalid_image" });
    }
    if (width < 64 || height < 64) {
      return reply.status(400).send({ error: "image_too_small" });
    }
    if (width > 8000 || height > 8000) {
      return reply.status(400).send({ error: "image_too_large" });
    }
    
    const sizes = [
      { name: "lg", size: 400 },
      { name: "md", size: 200 },
      { name: "sm", size: 80 }
    ];

    const results: Record<string, string> = {};

    for (const s of sizes) {
      const thumbFilename = `${uploadId}_${s.name}.webp`;
      const thumbPath = path.join(publicDir, thumbFilename);
      await sharp(buffer)
        .resize(s.size, s.size, { fit: "cover" })
        .webp({ quality: 85 })
        .toFile(thumbPath);
      results[s.name] = `/public/uploads/${thumbFilename}`;
    }

    const mainFilename = `${uploadId}.webp`;
    const mainPath = path.join(publicDir, mainFilename);
    await sharp(buffer)
      .webp({ quality: 90 })
      .toFile(mainPath);

    const avatarUrl = `/public/uploads/${mainFilename}`;

    const current = await server.store.getProfile();
    const updated = { ...(current ?? { displayName: "用户", gender: "other", age: 30 }), avatarUrl };
    await server.store.setProfile(updated);
    server.eventBus.publish({
      type: "profile.updated",
      ts: Date.now(),
      payload: { profile: updated }
    });

    return { avatarUrl, thumbnails: results };
  });

  server.get("/meta", async () => {
    return await server.store.getProfileMeta();
  });
};
