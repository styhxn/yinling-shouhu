import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  buildMe,
  codeMatches,
  createElderInvite,
  DEMO_FAMILY_CODE,
  FAMILY_CODE_TTL_MS,
  findOrCreateElderUser,
  findOrCreateFamilyUser,
  hashCode,
  isValidPhone,
  listFamilyLinkViews,
  normalizePhone,
  setSession
} from "../services/auth/accounts.js";
import { requireAuth, requireRole } from "../services/auth/rbac.js";
import { clearSessionCookie } from "../services/auth/session.js";

const DemoLoginSchema = z.object({
  // 演示入口只面向长辈与家人；机构/管理员不能通过免密演示登录获得权限。
  role: z.enum(["elder", "family"]),
  elderId: z.string().min(1).max(64).optional()
});

const PhoneSchema = z.object({
  phone: z.string().min(6).max(32)
});

const FamilyLoginSchema = z.object({
  phone: z.string().min(6).max(32),
  code: z.string().regex(/^\d{6}$/),
  displayName: z.string().trim().max(40).optional()
});

const ElderBindSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

const SwitchElderSchema = z.object({
  elderId: z.string().min(1).max(64)
});

const CreateElderSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  relation: z.string().max(32).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  gender: z.enum(["female", "male", "other"]).optional()
});

export const authRoutes: FastifyPluginAsync = async (server) => {
  server.get("/api/auth/meta", async () => ({
    demoMode: server.config.demoMode,
    demoFamilyCode: server.config.demoMode ? DEMO_FAMILY_CODE : null
  }));

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
      return reply.code(404).send({ error: "not_found", message: "长辈不存在" });
    }

    const familyLinks =
      user.role === "family" ? await listFamilyLinkViews(server.db, user.id) : [];
    const activeElderId =
      user.role === "family" ? familyLinks[0]?.elderId ?? null : user.elderId;
    setSession(reply, server.config, user, activeElderId);

    await server.db.auditLogs.insert({
      userId: user.id,
      action: "auth.demo_login",
      ip: req.ip
    });

    return buildMe(server.db, user, activeElderId);
  });

  server.post("/api/auth/family/request-code", async (req, reply) => {
    const parsed = PhoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "请输入手机号" });
    }
    const phone = normalizePhone(parsed.data.phone);
    if (!isValidPhone(phone)) {
      return reply.code(400).send({ error: "invalid_phone", message: "手机号格式不正确" });
    }
    if (!server.config.demoMode) {
      return reply.code(503).send({
        error: "sms_not_configured",
        message: "短信服务尚未配置，请联系管理员或使用演示入口"
      });
    }

    const now = Date.now();
    const expiresAt = now + FAMILY_CODE_TTL_MS;
    await server.db.authCodes.create({
      id: `code_${randomUUID()}`,
      phone,
      codeHash: hashCode(DEMO_FAMILY_CODE, server.config.sessionSecret),
      expiresAt,
      createdAt: now
    });

    return { ok: true, expiresAt, demoCode: DEMO_FAMILY_CODE };
  });

  server.post("/api/auth/family/login", async (req, reply) => {
    const parsed = FamilyLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "手机号或验证码不正确" });
    }
    const phone = normalizePhone(parsed.data.phone);
    if (!isValidPhone(phone)) {
      return reply.code(400).send({ error: "invalid_phone", message: "手机号格式不正确" });
    }

    const record = await server.db.authCodes.latest(phone);
    const now = Date.now();
    if (
      !record ||
      record.consumedAt !== null ||
      record.expiresAt < now ||
      record.attempts >= 5
    ) {
      return reply.code(401).send({
        error: "invalid_code",
        message: "验证码已失效，请重新获取"
      });
    }
    if (!codeMatches(parsed.data.code, record.codeHash, server.config.sessionSecret)) {
      const attempts = await server.db.authCodes.incrementAttempts(record.id);
      if (attempts >= 5) await server.db.authCodes.markConsumed(record.id, now);
      return reply.code(401).send({ error: "invalid_code", message: "验证码不正确" });
    }

    await server.db.authCodes.markConsumed(record.id, now);
    let user;
    try {
      user = await findOrCreateFamilyUser(server.db, phone, parsed.data.displayName);
    } catch (err) {
      if (err instanceof Error && err.message === "phone_in_use") {
        return reply.code(409).send({ error: "phone_in_use", message: "该手机号已被其他角色使用" });
      }
      throw err;
    }

    const links = await listFamilyLinkViews(server.db, user.id);
    const activeElderId = links[0]?.elderId ?? null;
    setSession(reply, server.config, user, activeElderId);
    await server.db.auditLogs.insert({
      userId: user.id,
      action: "auth.family_login",
      ip: req.ip
    });
    return buildMe(server.db, user, activeElderId);
  });

  server.post("/api/auth/elder/bind", async (req, reply) => {
    const parsed = ElderBindSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "请输入 6 位绑定码" });
    }

    const now = Date.now();
    const codeHash = hashCode(parsed.data.code, server.config.sessionSecret);
    const invite = await server.db.elderInvites.findByHash(codeHash);
    if (!invite || invite.expiresAt < now || invite.attempts >= 10) {
      return reply.code(401).send({
        error: "invalid_code",
        message: "绑定码无效或已过期，请让家人重新生成"
      });
    }

    const elder = await server.db.elders.getById(invite.elderId);
    if (!elder) {
      return reply.code(404).send({ error: "not_found", message: "长辈档案不存在" });
    }
    const user = await findOrCreateElderUser(server.db, elder);
    await server.db.elderInvites.markConsumed(invite.id, now);
    setSession(reply, server.config, user, elder.id);
    await server.db.auditLogs.insert({
      userId: user.id,
      action: "auth.elder_bind",
      ip: req.ip
    });
    return buildMe(server.db, user, elder.id);
  });

  server.post(
    "/api/auth/switch-elder",
    { preHandler: requireRole("family") },
    async (req, reply) => {
      const parsed = SwitchElderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", message: "请选择长辈" });
      }
      const user = await server.db.users.getById(req.user!.userId);
      if (!user) return reply.code(401).send({ error: "unauthorized" });
      const links = await server.db.users.listFamilyLinks(user.id);
      if (!links.some((link) => link.elderId === parsed.data.elderId)) {
        return reply.code(403).send({ error: "forbidden", message: "未绑定该长辈" });
      }
      setSession(reply, server.config, user, parsed.data.elderId);
      await server.db.auditLogs.insert({
        userId: user.id,
        action: "auth.switch_elder",
        meta: { elderId: parsed.data.elderId },
        ip: req.ip
      });
      return buildMe(server.db, user, parsed.data.elderId);
    }
  );

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

    if (user.role === "family") {
      const links = await server.db.users.listFamilyLinks(user.id);
      const requested = current.elderId;
      const active =
        requested && links.some((link) => link.elderId === requested)
          ? requested
          : links[0]?.elderId ?? null;
      return buildMe(server.db, user, active);
    }
    return buildMe(server.db, user, user.elderId);
  });

  // Kept here so account-creation and invite regeneration share one auth module.
  server.post(
    "/api/auth/family/elders",
    { preHandler: requireRole("family") },
    async (req, reply) => {
      const parsed = CreateElderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", message: "请填写长辈姓名" });
      }
      const user = await server.db.users.getById(req.user!.userId);
      if (!user) return reply.code(401).send({ error: "unauthorized" });
      const now = Date.now();
      const elderId = `e_${randomUUID()}`;
      const elder = await server.db.elders.create({
        id: elderId,
        displayName: parsed.data.displayName.trim().slice(0, 20),
        birthYear: parsed.data.birthYear ?? null,
        gender: parsed.data.gender ?? null,
        createdAt: now
      });
      await server.db.users.create({
        id: `u_${randomUUID()}`,
        role: "elder",
        displayName: elder.displayName,
        elderId: elder.id,
        phone: null,
        createdAt: now
      });
      await server.db.familyLinks.create({
        id: `fl_${randomUUID()}`,
        familyUserId: user.id,
        elderId: elder.id,
        relation: parsed.data.relation ?? null,
        phone: user.phone ?? null,
        createdAt: now
      });
      const invite = await createElderInvite(server.db, server.config, elder.id, user.id);
      await server.db.auditLogs.insert({
        userId: user.id,
        action: "family.create_elder",
        targetType: "elder",
        targetId: elder.id,
        ip: req.ip
      });
      return { ok: true, elder, invite };
    }
  );

  server.post(
    "/api/auth/family/elders/:id/invite",
    { preHandler: requireRole("family") },
    async (req, reply) => {
      const params = z.object({ id: z.string().min(1).max(64) }).safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_body" });
      const user = await server.db.users.getById(req.user!.userId);
      if (!user) return reply.code(401).send({ error: "unauthorized" });
      const links = await server.db.users.listFamilyLinks(user.id);
      if (!links.some((link) => link.elderId === params.data.id)) {
        return reply.code(403).send({ error: "forbidden", message: "未绑定该长辈" });
      }
      const invite = await createElderInvite(server.db, server.config, params.data.id, user.id);
      return { ok: true, invite };
    }
  );
};
