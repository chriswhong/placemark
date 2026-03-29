import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import sql from "../db.js";

// In development, we hardcode the logged-in user.
// Replace this with real auth (JWT, session, etc.) when ready.
const DEV_USERNAME = process.env.DEV_USERNAME ?? "chriswhong";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    username: string;
  }
}

// fp() makes this non-encapsulated so decorateRequest + addHook apply globally
export const authPlugin = fp(async function auth(fastify: FastifyInstance) {
  fastify.decorateRequest("userId", "");
  fastify.decorateRequest("username", "");

  fastify.addHook("onRequest", async (request) => {
    const rows = await sql<{ id: string; username: string }[]>`
      SELECT id, username FROM users WHERE username = ${DEV_USERNAME} LIMIT 1
    `;
    if (!rows.length) {
      throw new Error(`Dev user '${DEV_USERNAME}' not found in database`);
    }
    request.userId = rows[0].id;
    request.username = rows[0].username;
  });
});
