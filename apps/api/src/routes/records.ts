import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const ManualRecordSchema = z.object({
  date: z.string().optional(),
  steps: z.number().int().min(0).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  activeMinutes: z.number().int().min(0).optional(),
  outdoorMinutes: z.number().int().min(0).optional(),
  moodScore: z.number().int().min(0).max(100).optional()
});

export const recordsRoutes: FastifyPluginAsync = async (server) => {
  server.get("/trends", async () => {
    const metrics = await server.store.getRecentMetrics();
    return { metrics };
  });

  server.post("/manual", async (req, reply) => {
    const parsed = ManualRecordSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
    const { date, steps, sleepHours, activeMinutes, outdoorMinutes, moodScore } = parsed.data;
    if (
      typeof steps === "undefined" &&
      typeof sleepHours === "undefined" &&
      typeof activeMinutes === "undefined" &&
      typeof outdoorMinutes === "undefined" &&
      typeof moodScore === "undefined"
    ) {
      return reply.status(400).send({ error: "empty_values" });
    }
    let ts = Date.now();
    if (date && typeof date === "string") {
      const parsedDate = Date.parse(date.length <= 10 ? `${date}T12:00:00` : date);
      if (!Number.isNaN(parsedDate)) ts = parsedDate;
    }
    const metrics: { type: string; value: number; ts: number; source: string }[] = [];
    if (typeof steps === "number") metrics.push({ type: "steps", value: steps, ts, source: "manual" });
    if (typeof sleepHours === "number") metrics.push({ type: "sleepHours", value: sleepHours, ts, source: "manual" });
    if (typeof activeMinutes === "number")
      metrics.push({ type: "activeMinutes", value: activeMinutes, ts, source: "manual" });
    if (typeof outdoorMinutes === "number")
      metrics.push({ type: "outdoorMinutes", value: outdoorMinutes, ts, source: "manual" });
    if (typeof moodScore === "number") metrics.push({ type: "moodScore", value: moodScore, ts, source: "manual" });
    await server.store.addMetrics(metrics);
    return reply.status(200).send({ ok: true });
  });
};
