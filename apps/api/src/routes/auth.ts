import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../services/auth/rbac.js";
import {
  buildSessionCookie,
  clearSessionCookie,
  createSessionToken
} from "../services/auth/session.js";

const DemoLoginSchema = z.object({
  role: z.enum(["elder", "family", "institution", "admin"]),
  elderId: z.string().min(1).max(64).optional()
});

export const authRoutes: FastifyPluginAsync = async (server) => {
  server.post("/api/auth/demo-login", async (req, reply) => {
    if (!server.config.demoMode) {
      return reply.code(404).send({ error: "not_found", message: "演示登录未开启" });
    }
    const parsed = DemoLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "角色不正确" });
    }

    const user = await server.db.users.findDemo(parsed.data.role);
    if (!user) {
      return reply.code(404).send({ error: "not_found", message: "演示账号不存在" });
    }
    if (parsed.data.elderId && user.elderId && parsed.data.elderId !== user.elderId) {
      return reply.code(404).send({ error: "not_found", message: "老人不存在" });
    }

    const token = createSessionToken(
      {
        userId: user.id,
        role: user.role,
        ...(user.elderId ? { elderId: user.elderId } : {})
      },
      server.config.sessionSecret,
      server.config.sessionTtlMs
    );
    reply.header(
      "set-cookie",
      buildSessionCookie({
        name: server.config.cookieName,
        token,
        ttlMs: server.config.sessionTtlMs,
        secure: server.config.cookieSecure
      })
    );

    const elder = user.elderId ? await server.db.elders.getById(user.elderId) : null;
    const familyLinks =
      user.role === "family"
        ? (await server.db.users.listFamilyLinks(user.id)).map((link) => ({
            elderId: link.elderId,
            relation: link.relation
          }))
        : [];

    await server.db.auditLogs.insert({
      userId: user.id,
      action: "auth.demo_login",
      ip: req.ip
    });

    return {
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        elderId: user.elderId
      },
      elder,
      familyLinks
    };
  });

  server.post("/api/auth/logout", async (req, reply) => {
    reply.header(
      "set-cookie",
      clearSessionCookie(server.config.cookieName, server.config.cookieSecure)
    );
    if (req.user) {
      await server.db.auditLogs.insert({ userId: req.user.userId, action: "auth.logout", ip: req.ip });
    }
    return { ok: true };
  });

  server.get("/api/me", { preHandler: requireAuth }, async (req, reply) => {
    const current = req.user;
    if (!current) return reply.code(401).send({ error: "unauthorized" });
    const user = await server.db.users.getById(current.userId);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const elder = user.elderId ? await server.db.elders.getById(user.elderId) : null;
    const familyLinks =
      user.role === "family"
        ? (await server.db.users.listFamilyLinks(user.id)).map((link) => ({
            elderId: link.elderId,
            relation: link.relation
          }))
        : [];

    return {
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        elderId: user.elderId
      },
      elder,
      familyLinks
    };
  });
};
