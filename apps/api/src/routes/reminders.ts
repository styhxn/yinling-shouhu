import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const DueSchema = z.object({
  kind: z.enum(["medicine", "water", "exercise", "selfcheck"]),
  title: z.string().min(1).max(80)
});

export const remindersRoutes: FastifyPluginAsync = async (server) => {
  server.post("/due", async (req, reply) => {
    const parsed = DueSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });

    server.eventBus.publish({
      type: "reminder.due",
      ts: Date.now(),
      payload: { kind: parsed.data.kind, title: parsed.data.title }
    });

    return { ok: true };
  });
};

