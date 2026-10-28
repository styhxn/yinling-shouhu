import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Role } from "../../store/db.js";

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    reply.code(401).send({ error: "unauthorized", message: "请先选择身份" });
  }
}

export function requireRole(...roles: Role[]): preHandlerHookHandler {
  return async (req, reply) => {
    if (!req.user) {
      return reply.code(401).send({ error: "unauthorized", message: "请先选择身份" });
    }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "当前身份无法访问" });
    }
  };
}

export async function canAccessElder(req: FastifyRequest, elderId: string): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  if (req.user.role === "elder") return req.user.elderId === elderId;
  if (req.user.role === "family") {
    const links = await req.server.db.users.listFamilyLinks(req.user.userId);
    return links.some((link) => link.elderId === elderId);
  }
  return false;
}

export function requireElderAccess(elderId: string): preHandlerHookHandler {
  return async (req, reply) => {
    if (!req.user) {
      return reply.code(401).send({ error: "unauthorized", message: "请先选择身份" });
    }
    if (!(await canAccessElder(req, elderId))) {
      return reply.code(403).send({ error: "forbidden", message: "无权访问该老人数据" });
    }
  };
}
