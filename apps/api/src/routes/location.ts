import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth } from "../services/auth/rbac.js";
import { distanceToGeofence, isInsideGeofence } from "../services/safety/geofence.js";

const CircleShapeSchema = z.object({
  type: z.literal("circle"),
  center: z.tuple([z.number(), z.number()]),
  radius: z.number().min(50).max(10_000)
});

const GeofenceCreateSchema = z.object({
  elderId: z.string().max(80).optional(),
  name: z.string().min(1).max(40),
  shape: CircleShapeSchema,
  notifyOn: z.array(z.enum(["exit", "enter"])).max(2).optional(),
  schedule: z.unknown().optional()
});

const GeofenceUpdateSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  shape: CircleShapeSchema.optional(),
  notifyOn: z.array(z.enum(["exit", "enter"])).max(2).optional(),
  schedule: z.unknown().optional(),
  active: z.boolean().optional()
});

const LocationSchema = z.object({
  elderId: z.string().max(80).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(5_000).optional(),
  source: z.enum(["browser", "demo", "wearable"]).optional()
});

const AlertsQuerySchema = z.object({
  elderId: z.string().max(80).optional(),
  status: z.enum(["open", "ack", "resolved"]).optional()
});

const AlertUpdateSchema = z.object({ status: z.enum(["ack", "resolved"]) });

const PosterSchema = z.object({
  elderId: z.string().max(80).optional(),
  lastSeenText: z.string().min(1).max(120),
  lastSeenTs: z.number().optional(),
  clothing: z.string().max(80).optional(),
  contact: z.string().min(1).max(60),
  photoId: z.string().max(80).optional()
});

const TimeRangeSchema = z.object({
  elderId: z.string().max(80).optional(),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional()
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(ts: number | null) {
  if (!ts) return "时间不详";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function posterHtml(input: {
  name: string;
  age: number | null;
  lastSeenText: string;
  lastSeenTs: number | null;
  clothing: string | null;
  contact: string;
}) {
  const age = input.age === null ? "" : `${input.age} 岁`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>寻人：${escapeHtml(input.name)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #F3F4EE; color: #1E2A27; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  .paper { max-width: 640px; margin: 32px auto; padding: 40px 36px; background: #FCFCF8; border: 1px solid #DDE3DA; }
  .seal { display: inline-block; padding: 6px 10px; border: 1px solid #8C3B2E; color: #8C3B2E; font-size: 12px; letter-spacing: 0.2em; }
  h1 { margin: 18px 0 6px; font-family: "Songti SC", "STSong", "SimSun", serif; font-size: 38px; font-weight: 600; }
  .sub { color: #5C6B66; margin: 0 0 28px; }
  .row { display: grid; grid-template-columns: 96px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid #E7EBE4; }
  .row dt { color: #7A8983; font-size: 13px; }
  .row dd { margin: 0; font-size: 16px; line-height: 1.6; }
  .call { display: inline-block; margin-top: 28px; padding: 12px 20px; background: #3F5A50; color: #fff; text-decoration: none; }
  .note { margin-top: 24px; color: #7A8983; font-size: 12px; line-height: 1.7; }
</style>
</head>
<body>
  <main class="paper">
    <span class="seal">寻人</span>
    <h1>${escapeHtml(input.name)}</h1>
    <p class="sub">${age}${age ? " · " : ""}请帮忙留意，谢谢</p>
    <dl>
      <div class="row"><dt>最后出现</dt><dd>${escapeHtml(input.lastSeenText)}</dd></div>
      <div class="row"><dt>时间</dt><dd>${formatTime(input.lastSeenTs)}</dd></div>
      ${input.clothing ? `<div class="row"><dt>衣着</dt><dd>${escapeHtml(input.clothing)}</dd></div>` : ""}
      <div class="row"><dt>联系人</dt><dd>${escapeHtml(input.contact)}</dd></div>
    </dl>
    <a class="call" href="tel:110">拨打 110</a>
    <p class="note">位置信息由家属提供，已做模糊处理。如见到相似老人，请先确保安全，再联系家属或拨打 110。</p>
  </main>
</body>
</html>`;
}

export const locationRoutes: FastifyPluginAsync = async (server) => {
  server.get("/geofence", { preHandler: requireAuth }, async (req, reply) => {
    const query = TimeRangeSchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    return { items: server.db.geofences.listByElder(elderId) };
  });

  server.post("/geofence", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = GeofenceCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const geofence = server.db.geofences.create({
      elderId,
      name: parsed.data.name,
      shape: parsed.data.shape,
      ...(parsed.data.notifyOn ? { notifyOn: parsed.data.notifyOn } : {}),
      ...(typeof parsed.data.schedule !== "undefined" ? { schedule: parsed.data.schedule } : {})
    });
    server.db.auditLogs.insert({
      userId: req.user!.userId,
      action: "geofence.create",
      targetType: "geofence",
      targetId: geofence.id,
      ip: req.ip
    });
    return { ok: true, geofence };
  });

  server.patch("/geofence/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1).max(80) }).safeParse(req.params);
    const body = GeofenceUpdateSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_body" });
    const current = server.db.geofences.getById(params.data.id);
    if (!current) return reply.code(404).send({ error: "not_found" });
    const elderId = resolveElderId(req, current.elderId);
    if (elderId !== current.elderId) return reply.code(403).send({ error: "forbidden" });
    const geofence = server.db.geofences.update(
      current.id,
      body.data as Parameters<typeof server.db.geofences.update>[1]
    );
    return { ok: true, geofence };
  });

  server.delete("/geofence/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1).max(80) }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_body" });
    const current = server.db.geofences.getById(params.data.id);
    if (!current) return reply.code(404).send({ error: "not_found" });
    const elderId = resolveElderId(req, current.elderId);
    if (elderId !== current.elderId) return reply.code(403).send({ error: "forbidden" });
    server.db.geofences.remove(current.id);
    return { ok: true };
  });

  server.post("/location", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = LocationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const point = {
      elderId,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      accuracy: parsed.data.accuracy ?? null,
      source: parsed.data.source ?? "demo",
      ts: Date.now()
    };
    server.db.locations.insert(point);
    server.eventBus.publish({
      type: "location.updated",
      ts: Date.now(),
      payload: { elderId, point }
    });

    const geofences = server.db.geofences.listByElder(elderId);
    const inside = geofences.every((geofence) => isInsideGeofence(point, geofence.shape));
    const alerts = [];

    for (const geofence of geofences) {
      if (!geofence.notifyOn.includes("exit")) continue;
      if (isInsideGeofence(point, geofence.shape)) continue;
      if (server.db.safetyAlerts.hasRecent(elderId, "geofence.exit", Date.now() - 5 * 60 * 1000)) {
        continue;
      }
      const distance = Math.round(distanceToGeofence(point, geofence.shape));
      const alert = server.db.safetyAlerts.create({
        elderId,
        type: "geofence.exit",
        level: "critical",
        payload: {
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          distanceMeters: distance,
          lastPoint: { lat: point.lat, lng: point.lng, ts: point.ts }
        }
      });
      alerts.push(alert);
      server.eventBus.publish({
        type: "safety.alert",
        ts: Date.now(),
        payload: { alert }
      });
    }

    return { ok: true, point, inside, alerts };
  });

  server.get("/location/latest", { preHandler: requireAuth }, async (req, reply) => {
    const query = TimeRangeSchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    return { point: server.db.locations.latest(elderId) };
  });

  server.get("/location/history", { preHandler: requireAuth }, async (req, reply) => {
    const query = TimeRangeSchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const to = query.data.to ?? Date.now();
    const from = query.data.from ?? to - 24 * 60 * 60 * 1000;
    return { points: server.db.locations.history(elderId, from, to) };
  });

  server.get("/alerts", { preHandler: requireAuth }, async (req, reply) => {
    const query = AlertsQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    return {
      items: server.db.safetyAlerts.listByElder(elderId, query.data.status)
    };
  });

  server.patch("/alerts/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = z.object({ id: z.string().min(1).max(80) }).safeParse(req.params);
    const body = AlertUpdateSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const alerts = server.db.safetyAlerts.listByElder(elderId);
    const current = alerts.find((alert) => alert.id === params.data.id);
    if (!current) {
      return reply.code(404).send({ error: "not_found" });
    }
    server.db.safetyAlerts.ack(params.data.id, body.data.status);
    server.eventBus.publish({
      type: "safety.alert.updated",
      ts: Date.now(),
      payload: { alert: { ...current, status: body.data.status } }
    });
    return { ok: true };
  });

  server.post("/missing-poster", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = PosterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = resolveElderId(req, parsed.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const poster = server.db.missingPosters.create({
      elderId,
      lastSeenText: parsed.data.lastSeenText,
      lastSeenTs: parsed.data.lastSeenTs ?? Date.now(),
      ...(parsed.data.clothing ? { clothing: parsed.data.clothing } : {}),
      contact: parsed.data.contact,
      shareToken: token,
      expiresAt,
      ...(parsed.data.photoId ? { photoUploadId: parsed.data.photoId } : {})
    });
    server.db.auditLogs.insert({
      userId: req.user!.userId,
      action: "missing_poster.create",
      targetType: "missing_poster",
      targetId: poster.id,
      ip: req.ip
    });
    return {
      ok: true,
      poster: {
        id: poster.id,
        shareUrl: `/api/safety/share/${poster.shareToken}`,
        expiresAt: poster.expiresAt
      }
    };
  });

  server.get("/share/:token", async (req, reply) => {
    const params = z.object({ token: z.string().min(1).max(80) }).safeParse(req.params);
    if (!params.success) return reply.code(404).type("text/html").send("<h1>链接无效</h1>");
    const poster = server.db.missingPosters.getByToken(params.data.token);
    if (!poster || poster.expiresAt < Date.now()) {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send("<h1>链接已过期或不存在</h1>");
    }
    const age = poster.birthYear ? new Date().getFullYear() - poster.birthYear : null;
    return reply.type("text/html; charset=utf-8").send(
      posterHtml({
        name: poster.elderName,
        age,
        lastSeenText: poster.lastSeenText,
        lastSeenTs: poster.lastSeenTs,
        clothing: poster.clothing,
        contact: poster.contact
      })
    );
  });
};
