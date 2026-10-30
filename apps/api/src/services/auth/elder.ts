import type { FastifyRequest } from "fastify";
import { canAccessElder } from "./rbac.js";

export async function resolveElderId(req: FastifyRequest, requested?: string): Promise<string | null> {
  const user = req.user;
  if (!user) return null;
  if (user.role === "elder") return user.elderId ?? null;
  if (user.role === "family") {
    const links = await req.server.db.users.listFamilyLinks(user.userId);
    const first = links[0]?.elderId ?? null;
    const candidate = requested ?? user.elderId ?? first;
    if (!candidate) return null;
    if (await canAccessElder(req, candidate)) return candidate;
    // 会话里记住的长辈若已解绑，回退到第一位，避免整个家人端不可用。
    if (!requested && first && first !== candidate) {
      return (await canAccessElder(req, first)) ? first : null;
    }
    return null;
  }
  return null;
}
