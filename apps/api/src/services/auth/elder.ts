import type { FastifyRequest } from "fastify";
import { canAccessElder } from "./rbac.js";

export function resolveElderId(req: FastifyRequest, requested?: string): string | null {
  const user = req.user;
  if (!user) return null;
  if (user.role === "elder") return user.elderId ?? null;
  if (user.role === "family") {
    const candidate =
      requested ?? req.server.db.users.listFamilyLinks(user.userId)[0]?.elderId ?? null;
    if (!candidate) return null;
    return canAccessElder(req, candidate) ? candidate : null;
  }
  return null;
}
