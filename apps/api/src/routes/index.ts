import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { requireAuth } from "../services/auth/rbac.js";
import { adminRoutes } from "./admin.js";
import { authRoutes } from "./auth.js";
import { agentRoutes } from "./agent.js";
import { healthRoutes } from "./health.js";
import { healthProfileRoutes } from "./healthProfile.js";
import { dietRoutes } from "./diet.js";
import { familyRoutes } from "./family.js";
import { locationRoutes } from "./location.js";
import { medicationRoutes } from "./medications.js";
import { memoryRoutes } from "./memory.js";
import { roleplayRoutes } from "./roleplay.js";
import { safetyRoutes } from "./safety.js";
import { uploadRoutes } from "./uploads.js";
import { privacyRoutes } from "./privacy.js";
import { profileRoutes } from "./profile.js";
import { recordsRoutes } from "./records.js";
import { qaRoutes } from "./qa.js";
import { mockRoutes } from "./mock.js";
import { wsRoutes } from "./ws.js";
import { emergencyRoutes } from "./emergency.js";
import { remindersRoutes } from "./reminders.js";
import { weatherRoutes } from "./weather.js";
import { weatherAgentRoutes } from "./weatherAgent.js";
import { vitalityRoutes } from "./vitality.js";
import { dhLiveRoutes } from "./dhLive.js";
import { adviceRoutes } from "./advice.js";
import { analysisRoutes } from "./analysis.js";

export async function registerRoutes(server: FastifyInstance) {
  // 旧版单人模式接口仍保留给历史页面，但必须登录后才能访问；避免匿名读写健康档案、录音与提醒。
  const legacyWithAuth = async (plugin: FastifyPluginAsync, prefix: string) => {
    await server.register(
      async (scope) => {
        scope.addHook("preHandler", requireAuth);
        await scope.register(plugin);
      },
      { prefix }
    );
  };

  await server.register(authRoutes);
  await server.register(agentRoutes, { prefix: "/api/agent" });
  await server.register(uploadRoutes, { prefix: "/api/uploads" });
  await server.register(safetyRoutes, { prefix: "/api/safety" });
  await server.register(locationRoutes, { prefix: "/api/safety" });
  await server.register(roleplayRoutes, { prefix: "/api/safety/roleplay" });
  await server.register(medicationRoutes, { prefix: "/api/medications" });
  await server.register(healthProfileRoutes, { prefix: "/api/health" });
  await server.register(dietRoutes, { prefix: "/api/diet" });
  await server.register(familyRoutes, { prefix: "/api/family" });
  await server.register(memoryRoutes, { prefix: "/api/memory" });
  await server.register(adminRoutes, { prefix: "/api/admin" });
  await server.register(healthRoutes);
  await legacyWithAuth(privacyRoutes, "/privacy");
  await legacyWithAuth(profileRoutes, "/profile");
  await legacyWithAuth(recordsRoutes, "/records");
  await legacyWithAuth(qaRoutes, "/qa");
  await legacyWithAuth(emergencyRoutes, "/emergency");
  await legacyWithAuth(remindersRoutes, "/reminders");
  await legacyWithAuth(weatherAgentRoutes, "/api/weather");
  await legacyWithAuth(weatherRoutes, "/weather");
  await legacyWithAuth(vitalityRoutes, "/vitality");
  await legacyWithAuth(adviceRoutes, "/advice");
  await legacyWithAuth(analysisRoutes, "/analysis");
  await server.register(mockRoutes, { prefix: "/mock" });
  await server.register(wsRoutes);
  await server.register(dhLiveRoutes, { prefix: "/dh-live-api" });
}
