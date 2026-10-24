import type { FastifyPluginAsync } from "fastify";
import type { AppEvent } from "@eha/shared";
import type { SessionUser } from "../services/auth/types.js";
import { readCookie, verifySessionToken } from "../services/auth/session.js";

export function eventElderId(event: AppEvent): string | null {
  if (event.type === "safety.alert") {
    const alert = (event.payload as { alert?: { elderId?: unknown } }).alert;
    return typeof alert?.elderId === "string" ? alert.elderId : null;
  }
  if (event.type === "family.confirm.requested" || event.type === "family.confirm.responded") {
    const confirm = (event.payload as { confirm?: { elderId?: unknown } }).confirm;
    return typeof confirm?.elderId === "string" ? confirm.elderId : null;
  }
  return null;
}

export function canReceiveEvent(
  user: SessionUser | null,
  event: AppEvent,
  familyElderIds: string[]
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const elderId = eventElderId(event);
  if (!elderId) return true;
  if (user.role === "elder") return user.elderId === elderId;
  if (user.role === "family") return familyElderIds.includes(elderId);
  return false;
}

export const wsRoutes: FastifyPluginAsync = async (server) => {
  server.get("/ws", { websocket: true }, (socket, req) => {
    const token = readCookie(req.headers.cookie, server.config.cookieName);
    const user = token ? verifySessionToken(token, server.config.sessionSecret) : null;
    if (!user) {
      socket.close(4401, "unauthorized");
      return;
    }

    const familyElderIds =
      user.role === "family"
        ? server.db.users.listFamilyLinks(user.userId).map((link) => link.elderId)
        : [];

    const unsubscribe = server.eventBus.subscribe((event) => {
      if (!canReceiveEvent(user, event, familyElderIds)) return;
      try {
        socket.send(JSON.stringify(event));
      } catch {
        undefined;
      }
    });

    socket.on("close", () => {
      unsubscribe();
    });
  });
};
