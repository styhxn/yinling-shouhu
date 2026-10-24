import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../services/auth/rbac.js";
import type { AgentEvent } from "../services/agent/runner.js";

const AgentChatSchema = z
  .object({
    sessionId: z.string().min(1).max(80).optional(),
    inputType: z.enum(["text", "voice"]).optional(),
    message: z.string().max(4000).optional(),
    attachments: z
      .array(z.object({ kind: z.literal("image"), id: z.string().min(1).max(80) }))
      .max(4)
      .optional(),
    confirmationId: z.string().min(1).max(80).optional(),
    confirmationDecision: z.enum(["approve", "cancel"]).optional()
  })
  .refine((value) => Boolean(value.confirmationId) || Boolean(value.message?.trim()), {
    message: "message_required"
  });

const SessionParamsSchema = z.object({ id: z.string().min(1).max(80) });

function sse(reply: any, event: string, data: unknown) {
  if (reply.raw.writableEnded) return;
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function writeEvent(reply: any, event: AgentEvent) {
  switch (event.type) {
    case "meta":
      sse(reply, "meta", { sessionId: event.sessionId });
      return;
    case "token":
      sse(reply, "token", { text: event.text });
      return;
    case "tool_call":
      sse(reply, "tool_call", {
        id: event.id,
        name: event.name,
        args: event.args,
        risk: event.risk
      });
      return;
    case "tool_result":
      sse(reply, "tool_result", {
        id: event.id,
        ok: event.ok,
        summary: event.summary,
        latencyMs: event.latencyMs
      });
      return;
    case "confirmation_required":
      sse(reply, "confirmation_required", {
        id: event.id,
        tool: event.tool,
        summary: event.summary,
        risk: event.risk,
        expiresAt: event.expiresAt
      });
      return;
    case "done":
      sse(reply, "done", {
        sessionId: event.sessionId,
        riskLevel: event.riskLevel,
        citations: event.citations,
        ...(event.usage ? { usage: event.usage } : {})
      });
      return;
    case "error":
      sse(reply, "error", { code: event.code, message: event.message });
      return;
    default:
      return;
  }
}

export const agentRoutes: FastifyPluginAsync = async (server) => {
  server.post("/chat", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = AgentChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "请输入内容" });
    }
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    const controller = new AbortController();
    req.raw.on("close", () => controller.abort());
    const keepAlive = setInterval(() => {
      if (!reply.raw.writableEnded) reply.raw.write(": keep-alive\n\n");
    }, 15_000);

    try {
      const events = server.agent.run({
        user,
        requestId: req.id,
        message: parsed.data.message ?? "",
        signal: controller.signal,
        ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
        ...(parsed.data.confirmationId ? { confirmationId: parsed.data.confirmationId } : {}),
        ...(parsed.data.confirmationDecision
          ? { confirmationDecision: parsed.data.confirmationDecision }
          : {})
      });

      for await (const event of events) {
        writeEvent(reply, event);
      }
    } catch (err) {
      sse(reply, "error", {
        code: "agent_failed",
        message: err instanceof Error ? err.message : "agent_failed"
      });
    } finally {
      clearInterval(keepAlive);
      reply.raw.end();
    }

    return reply;
  });

  server.get("/tools", { preHandler: requireAuth }, async (req) => {
    const role = req.user?.role ?? "elder";
    return {
      tools: server.toolRegistry.list(role).map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: tool.risk,
        requiresConfirmation: tool.requiresConfirmation
      }))
    };
  });

  server.get("/sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = SessionParamsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const user = req.user;
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const session = server.db.sessions.get(params.data.id);
    if (!session) return reply.code(404).send({ error: "not_found" });
    if (session.userId !== user.userId) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return {
      session: {
        id: session.id,
        messages: session.messages,
        summary: session.summary,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    };
  });
};
