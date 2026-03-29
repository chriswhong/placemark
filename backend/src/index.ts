import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { authPlugin } from "./middleware/auth.js";
import { mapsRoutes } from "./routes/maps.js";
import { mapRoutes } from "./routes/map.js";

const server = Fastify({ logger: { level: "info" } });

await server.register(cors, {
  origin: ["http://localhost:5173", "http://localhost:4173"],
});

// Parse JSON request bodies
server.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

// Auth: decorate every request with userId / username
await server.register(authPlugin);

// Routes
await server.register(mapsRoutes, { prefix: "/api" });
await server.register(mapRoutes, { prefix: "/api" });

const port = Number(process.env.PORT ?? 3001);

try {
  await server.listen({ port, host: "0.0.0.0" });
  console.log(`Backend running at http://localhost:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
