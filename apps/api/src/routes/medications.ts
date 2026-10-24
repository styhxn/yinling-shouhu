import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth } from "../services/auth/rbac.js";
import { analyzeMedicationImage } from "../services/medication/scan.js";

const ScheduleSchema = z
  .array(z.object({ time: z.string().regex(/^\d{2}:\d{2}$/) }))
  .min(1)
  .max(6);

const MedicationCreateSchema = z.object({
  elderId: z.string().max(80).optional(),
  name: z.string().min(1).max(80),
  genericName: z.string().max(80).optional(),
  spec: z.string().max(40).optional(),
  dosage: z.string().max(120).optional(),
  schedule: ScheduleSchema,
  notes: z.string().max(300).optional()
});

const MedicationUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  genericName: z.string().max(80).nullable().optional(),
  spec: z.string().max(40).nullable().optional(),
  dosage: z.string().max(120).nullable().optional(),
  schedule: ScheduleSchema.optional(),
  notes: z.string().max(300).nullable().optional()
});

const LogSchema = z.object({
  medicationId: z.string().min(1).max(80),
  status: z.enum(["taken", "skipped", "late"]),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional()
});

const ScanSchema = z.object({ imageId: z.string().min(1).max(80) });
const QuerySchema = z.object({
  elderId: z.string().max(80).optional(),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional()
});
const IdParamsSchema = z.object({ id: z.string().min(1).max(80) });

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const medicationRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const items = server.db.medications.listByElder(elderId);
    const logs = server.db.medicationLogs.listByElder(elderId, startOfToday(), Date.now());
    const due = items.reduce((count, med) => count + med.schedule.length, 0);
    const taken = logs.filter((log) => log.status === "taken").length;
    const logged = logs.length;
    const adherencePct = due > 0 && logged > 0 ? Math.round((taken / due) * 100) : null;
    return { items, logs, dueToday: due, takenToday: taken, logged, adherencePct };
  });

  server.post("/", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = MedicationCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const medication = server.db.medications.create({
      elderId,
      name: parsed.data.name,
      ...(parsed.data.genericName ? { genericName: parsed.data.genericName } : {}),
      ...(parsed.data.spec ? { spec: parsed.data.spec } : {}),
      ...(parsed.data.dosage ? { dosage: parsed.data.dosage } : {}),
      schedule: parsed.data.schedule,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {})
    });
    return { ok: true, medication };
  });

  server.patch("/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    const body = MedicationUpdateSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_body" });
    const current = server.db.medications.getById(params.data.id);
    if (!current) return reply.code(404).send({ error: "not_found" });
    const elderId = resolveElderId(req, current.elderId);
    if (elderId !== current.elderId) return reply.code(403).send({ error: "forbidden" });
    const medication = server.db.medications.update(
      current.id,
      body.data as Parameters<typeof server.db.medications.update>[1]
    );
    return { ok: true, medication };
  });

  server.delete("/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const current = server.db.medications.getById(params.data.id);
    if (!current) return reply.code(404).send({ error: "not_found" });
    const elderId = resolveElderId(req, current.elderId);
    if (elderId !== current.elderId) return reply.code(403).send({ error: "forbidden" });
    server.db.medications.remove(current.id);
    return { ok: true };
  });

  server.post("/scan", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ScanSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const upload = server.db.uploads.getById(parsed.data.imageId);
    if (!upload) return reply.code(404).send({ error: "not_found", message: "图片不存在" });
    if (upload.ownerUserId !== req.user!.userId && upload.elderId !== elderId) {
      return reply.code(403).send({ error: "forbidden" });
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(path.join(server.config.uploadsDir, upload.path));
    } catch {
      return reply.code(404).send({ error: "not_found", message: "图片文件不存在" });
    }

    const result = await analyzeMedicationImage({
      buffer,
      mime: upload.mime,
      modelRouter: server.modelRouter
    });
    return { ok: true, result };
  });

  server.post("/log", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = LogSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const medication = server.db.medications.getById(parsed.data.medicationId);
    if (!medication) return reply.code(404).send({ error: "not_found" });
    if (medication.elderId !== elderId) return reply.code(403).send({ error: "forbidden" });
    const log = server.db.medicationLogs.create({
      medicationId: medication.id,
      elderId,
      status: parsed.data.status,
      ...(parsed.data.time ? { scheduledTime: parsed.data.time } : {})
    });
    return { ok: true, log };
  });

  server.get("/logs", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const to = query.data.to ?? Date.now();
    const from = query.data.from ?? to - 30 * 24 * 60 * 60 * 1000;
    return { items: server.db.medicationLogs.listByElder(elderId, from, to) };
  });
};
