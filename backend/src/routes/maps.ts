import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import sql from "../db.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

async function uniqueSlug(userId: string, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const rows = await sql<Row[]>`
      SELECT id FROM maps WHERE user_id = ${userId} AND slug = ${slug} LIMIT 1
    `;
    if (!rows.length) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

export async function mapsRoutes(fastify: FastifyInstance) {
  // GET /api/me — return current user
  fastify.get("/me", async (req) => {
    return { id: req.userId, username: req.username };
  });

  // GET /api/maps — list all maps for the current user
  fastify.get("/maps", async (req) => {
    const maps = await sql<Row[]>`
      SELECT id, slug, title, created_at, updated_at, (thumbnail IS NOT NULL) AS has_thumbnail
      FROM maps
      WHERE user_id = ${req.userId}
      ORDER BY updated_at DESC
    `;
    return maps;
  });

  // POST /api/maps — create a new map
  fastify.post<{ Body: { title?: string } }>("/maps", async (req) => {
    const title = req.body?.title || "Untitled Map";
    const base = slugify(title);
    const slug = await uniqueSlug(req.userId, base);
    const id = nanoid();

    await sql`
      INSERT INTO maps (id, user_id, slug, title)
      VALUES (${id}, ${req.userId}, ${slug}, ${title})
    `;

    // Create the metadata row for this map
    await sql`
      INSERT INTO metadata (map_id, data) VALUES (${id}, '{}')
    `;

    return { id, slug, title };
  });

  // GET /api/maps/:slug — get map by slug
  fastify.get<{ Params: { slug: string } }>("/maps/:slug", async (req, reply) => {
    const rows = await sql<Row[]>`
      SELECT id, slug, title, created_at, updated_at
      FROM maps
      WHERE user_id = ${req.userId} AND slug = ${req.params.slug}
      LIMIT 1
    `;
    if (!rows.length) return reply.status(404).send({ error: "Map not found" });
    return rows[0];
  });

  // PUT /api/maps/:slug — update title (and slug)
  fastify.put<{ Params: { slug: string }; Body: { title: string } }>(
    "/maps/:slug",
    async (req, reply) => {
      const { title } = req.body;
      const rows = await sql<Row[]>`
        SELECT id, slug FROM maps
        WHERE user_id = ${req.userId} AND slug = ${req.params.slug}
        LIMIT 1
      `;
      if (!rows.length) return reply.status(404).send({ error: "Map not found" });

      const map = rows[0] as { id: string; slug: string };
      const newBase = slugify(title);
      let newSlug = newBase;

      // Only regenerate slug if title changed meaningfully
      if (newBase !== map.slug) {
        newSlug = await uniqueSlug(req.userId, newBase);
      }

      await sql`
        UPDATE maps
        SET title = ${title}, slug = ${newSlug}, updated_at = now()
        WHERE id = ${map.id}
      `;

      return { id: map.id, slug: newSlug, title };
    },
  );

  // DELETE /api/maps/:slug
  fastify.delete<{ Params: { slug: string } }>("/maps/:slug", async (req, reply) => {
    const result = await sql`
      DELETE FROM maps
      WHERE user_id = ${req.userId} AND slug = ${req.params.slug}
    `;
    if (result.count === 0) return reply.status(404).send({ error: "Map not found" });
    return { ok: true };
  });
}
