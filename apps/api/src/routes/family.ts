import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveElderId } from "../services/auth/elder.js";
import { requireAuth, requireRole } from "../services/auth/rbac.js";
import { createFamilyService } from "../services/family/family.js";

const QuerySchema = z.object({ elderId: z.string().max(80).optional() });

const MemberSchema = z.object({
  familyUserId: z.string().min(1).max(80),
  content: z.string().min(1).max(500),
  kind: z.string().max(32).optional()
});

export const familyRoutes: FastifyPluginAsync = async (server) => {
  const family = createFamilyService(server.db);

  server.get("/summary", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, summary: await family.summary(elderId) };
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });

  server.get("/report/weekly", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    try {
      return { ok: true, report: await family.weeklyReport(elderId) };
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });

  // 家属联系人（含其留下的联系电话），长者端用于查看与一键发消息
  server.get("/members", { preHandler: requireAuth }, async (req, reply) => {
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req, query.data.elderId);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const links = await server.db.familyLinks.listByElder(elderId);
    const members = await Promise.all(
      links.map(async (link) => {
        const user = await server.db.users.getById(link.familyUserId);
        return {
          familyUserId: link.familyUserId,
          displayName: user?.displayName ?? "家属",
          relation: link.relation,
          phone: link.phone
        };
      })
    );
    return { ok: true, members };
  });

  // 一键给对应家属账号发送信息（站内消息，无需拨打电话）
  server.post("/message", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = MemberSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const elderId = await resolveElderId(req);
    if (!elderId) return reply.code(403).send({ error: "forbidden" });
    const link = (await server.db.familyLinks.listByElder(elderId)).find(
      (l) => l.familyUserId === parsed.data.familyUserId
    );
    if (!link) return reply.code(404).send({ error: "not_linked" });
    const message = await server.db.familyMessages.insert({
      elderId,
      familyUserId: link.familyUserId,
      fromRole: req.user?.role ?? "elder",
      content: parsed.data.content,
      kind: parsed.data.kind ?? "general"
    });
    server.eventBus.publish({
      type: "family.message",
      ts: message.createdAt,
      payload: { elderId, familyUserId: link.familyUserId, messageId: message.id }
    });
    return { ok: true, messageId: message.id };
  });

  // 家属读取老人发来的站内消息（按当前家属账号聚合，含老人姓名；未读自动标记已读）
  server.get("/messages", { preHandler: requireRole("family") }, async (req, reply) => {
    const familyUserId = req.user!.userId;
    const items = await server.db.familyMessages.listByFamily(familyUserId);
    const elderIds = [...new Set(items.map((item) => item.elderId))];
    const names = new Map<string, string>();
    await Promise.all(
      elderIds.map(async (id) => {
        const elder = await server.db.elders.getById(id);
        if (elder) names.set(id, elder.displayName);
      })
    );
    // 仅把“老人发来”的未读标记为已读（家属自己发出的不算未读）
    const unreadIds = items
      .filter((item) => !item.read && item.fromRole === "elder")
      .map((item) => item.id);
    if (unreadIds.length > 0) {
      await server.db.familyMessages.markRead(familyUserId, unreadIds);
    }
    return {
      ok: true,
      items: items.map((item) => ({
        id: item.id,
        elderId: item.elderId,
        elderName: names.get(item.elderId) ?? "家人",
        fromRole: item.fromRole,
        content: item.content,
        kind: item.kind,
        read: item.read,
        createdAt: item.createdAt
      }))
    };
  });

  // 家属给绑定的老人发送站内消息（反向：家属 -> 老人）
  server.post("/elder/message", { preHandler: requireRole("family") }, async (req, reply) => {
    const parsed = z
      .object({
        elderId: z.string().min(1).max(80),
        content: z.string().min(1).max(500),
        kind: z.string().max(32).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const familyUserId = req.user!.userId;
    const links = await server.db.users.listFamilyLinks(familyUserId);
    if (!links.some((link) => link.elderId === parsed.data.elderId)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const message = await server.db.familyMessages.insert({
      elderId: parsed.data.elderId,
      familyUserId,
      fromRole: "family",
      content: parsed.data.content,
      kind: parsed.data.kind ?? "general"
    });
    server.eventBus.publish({
      type: "elder.message",
      ts: message.createdAt,
      payload: { elderId: message.elderId, familyUserId, messageId: message.id }
    });
    return { ok: true, messageId: message.id };
  });

  // 老人读取家属发来的站内消息（按当前老人聚合，含家属姓名；未读自动标记已读）
  server.get("/elder/messages", { preHandler: requireRole("elder") }, async (req, reply) => {
    const elderId = req.user!.elderId!;
    const items = await server.db.familyMessages.listByElder(elderId);
    const links = await server.db.users.listFamilyLinks(elderId);
    const names = new Map<string, string>();
    await Promise.all(
      links.map(async (link) => {
        const user = await server.db.users.getById(link.familyUserId);
        if (user) names.set(link.familyUserId, user.displayName);
      })
    );
    const unreadIds = items
      .filter((item) => !item.read && item.fromRole === "family")
      .map((item) => item.id);
    if (unreadIds.length > 0) {
      await server.db.familyMessages.markReadElder(elderId, unreadIds);
    }
    return {
      ok: true,
      items: items.map((item) => ({
        id: item.id,
        elderId: item.elderId,
        familyName: names.get(item.familyUserId) ?? "家属",
        fromRole: item.fromRole,
        content: item.content,
        kind: item.kind,
        read: item.read,
        createdAt: item.createdAt
      }))
    };
  });
};
