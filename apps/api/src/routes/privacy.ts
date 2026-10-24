import type { FastifyPluginAsync } from "fastify";
import { PrivacySettingsSchema } from "@eha/shared";

export const privacyRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async () => {
    const settings = await server.store.getPrivacySettings();
    return settings;
  });

  server.put("/", async (req, reply) => {
    const parsed = PrivacySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    await server.store.setPrivacySettings(parsed.data);
    server.eventBus.publish({
      type: "privacy.updated",
      ts: Date.now(),
      payload: { settings: parsed.data }
    });
    return parsed.data;
  });
};

