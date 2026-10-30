import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

let resetting = false;

function tokenMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.post("/reset-demo", async (req, reply) => {
    if (!server.config.demoMode) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!server.config.demoResetToken || server.config.demoResetToken === "change-me") {
      return reply.code(503).send({
        error: "reset_token_not_configured",
        message: "演示重置令牌未配置，请先在环境变量中设置 DEMO_RESET_TOKEN"
      });
    }
    const headerToken = req.headers["x-demo-reset-token"];
    const bodyToken = (req.body as { token?: unknown } | null)?.token;
    const token = typeof headerToken === "string" ? headerToken : typeof bodyToken === "string" ? bodyToken : "";
    if (!token || !tokenMatches(token, server.config.demoResetToken)) {
      return reply.code(401).send({ error: "invalid_reset_token", message: "演示重置令牌不正确" });
    }
    if (resetting) {
      return reply.code(409).send({ error: "reset_in_progress", message: "正在重置，请稍候再试" });
    }

    resetting = true;
    try {
      const result = await server.db.resetDemoData();
      server.log.warn({ tables: result.tables }, "demo data reset");
      return { ok: true, resetAt: Date.now(), tables: result.tables };
    } finally {
      resetting = false;
    }
  });
};
