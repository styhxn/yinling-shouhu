import type { FastifyPluginAsync } from "fastify";

export const wsRoutes: FastifyPluginAsync = async (server) => {
  server.get(
    "/ws",
    { websocket: true },
    (socket) => {
      const unsubscribe = server.eventBus.subscribe((event) => {
        try {
          socket.send(JSON.stringify(event));
        } catch {
          undefined;
        }
      });

      socket.on("close", () => {
        unsubscribe();
      });
    }
  );
};
