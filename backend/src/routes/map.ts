import type { FastifyInstance } from "fastify";
import sql from "../db.js";

const MAX_MAP_DATA_BYTES = 5 * 1024 * 1024; // 5 MB

interface TransactBody {
  putFeatures?: Array<{ id: string; [key: string]: unknown }>;
  deleteFeatures?: string[];
  putFolders?: Array<{ id: string; [key: string]: unknown }>;
  deleteFolders?: string[];
  putLayerConfigs?: Array<{ id: string; [key: string]: unknown }>;
  deleteLayerConfigs?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function getMapId(
  userId: string,
  slug: string,
): Promise<string | null> {
  const rows = await sql<Row[]>`
    SELECT id FROM maps WHERE user_id = ${userId} AND slug = ${slug} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function mapRoutes(fastify: FastifyInstance) {
  // Return all map data needed to hydrate the client on load
  fastify.get<{ Params: { mapSlug: string } }>(
    "/maps/:mapSlug/data",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const [features, folders, layerConfigs, metaRows] = await Promise.all([
        sql<Row[]>`SELECT data, (image IS NOT NULL) AS has_image FROM features WHERE map_id = ${mapId}`,
        sql<Row[]>`SELECT data FROM folders WHERE map_id = ${mapId}`,
        sql<Row[]>`SELECT data FROM layer_configs WHERE map_id = ${mapId}`,
        sql<Row[]>`SELECT data FROM metadata WHERE map_id = ${mapId} LIMIT 1`,
      ]);

      return {
        features: features.map((r) => {
          const d = r.data;
          if (r.has_image) d._hasImage = true;
          return d;
        }),
        folders: folders.map((r) => r.data),
        layerConfigs: layerConfigs.map((r) => r.data),
        metadata: metaRows[0]?.data ?? {},
      };
    },
  );

  // Apply a moment: batch upserts/deletes across features, folders, layer configs
  fastify.post<{ Params: { mapSlug: string }; Body: TransactBody }>(
    "/maps/:mapSlug/transact",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const {
        putFeatures = [],
        deleteFeatures = [],
        putFolders = [],
        deleteFolders = [],
        putLayerConfigs = [],
        deleteLayerConfigs = [],
      } = req.body;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sql.begin(async (tx: any) => {
          for (const f of putFeatures) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await tx`
              INSERT INTO features (id, data, map_id) VALUES (${f.id}, ${tx.json(f as any)}, ${mapId})
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
            `;
          }
          if (deleteFeatures.length > 0) {
            await tx`DELETE FROM features WHERE id = ANY(${deleteFeatures}) AND map_id = ${mapId}`;
          }

          for (const f of putFolders) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await tx`
              INSERT INTO folders (id, data, map_id) VALUES (${f.id}, ${tx.json(f as any)}, ${mapId})
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
            `;
          }
          if (deleteFolders.length > 0) {
            await tx`DELETE FROM folders WHERE id = ANY(${deleteFolders}) AND map_id = ${mapId}`;
          }

          for (const lc of putLayerConfigs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await tx`
              INSERT INTO layer_configs (id, data, map_id) VALUES (${lc.id}, ${tx.json(lc as any)}, ${mapId})
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
            `;
          }
          if (deleteLayerConfigs.length > 0) {
            await tx`DELETE FROM layer_configs WHERE id = ANY(${deleteLayerConfigs}) AND map_id = ${mapId}`;
          }

          // Check total feature data size after mutations — rollback if over limit
          if (putFeatures.length > 0) {
            const [{ total }] = await tx<[{ total: number }]>`
              SELECT COALESCE(SUM(pg_column_size(data)), 0)::int AS total
              FROM features WHERE map_id = ${mapId}
            `;
            if (total > MAX_MAP_DATA_BYTES) {
              throw new Error("MAP_SIZE_LIMIT");
            }
          }
        });
      } catch (err) {
        if (err instanceof Error && err.message === "MAP_SIZE_LIMIT") {
          return reply.status(413).send({
            error: "Map data exceeds the 5 MB size limit. Remove some features before adding more.",
          });
        }
        throw err;
      }

      // Touch the map's updated_at
      await sql`UPDATE maps SET updated_at = now() WHERE id = ${mapId}`;

      return { ok: true };
    },
  );

  // GET /api/maps/:mapSlug/size — return the total feature data size in bytes
  fastify.get<{ Params: { mapSlug: string } }>(
    "/maps/:mapSlug/size",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const [{ total }] = await sql<[{ total: number }]>`
        SELECT COALESCE(SUM(pg_column_size(data)), 0)::int AS total
        FROM features WHERE map_id = ${mapId}
      `;
      return { bytes: total, limit: MAX_MAP_DATA_BYTES };
    },
  );

  // Get map-level metadata
  fastify.get<{ Params: { mapSlug: string } }>(
    "/maps/:mapSlug/metadata",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });
      const rows = await sql<Row[]>`SELECT data FROM metadata WHERE map_id = ${mapId} LIMIT 1`;
      return rows[0]?.data ?? {};
    },
  );

  // Shallow-merge updates into the metadata JSONB blob
  fastify.put<{ Params: { mapSlug: string }; Body: Record<string, unknown> }>(
    "/maps/:mapSlug/metadata",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sql`
        UPDATE metadata
        SET data = data || ${sql.json(req.body as any)}
        WHERE map_id = ${mapId}
      `;
      return { ok: true };
    },
  );

  // Upload a map thumbnail (JPEG blob)
  fastify.put<{ Params: { mapSlug: string } }>(
    "/maps/:mapSlug/thumbnail",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const buffer = req.body as Buffer;

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ error: "Empty body" });
      }
      if (buffer.length > 512 * 1024) {
        return reply.status(413).send({ error: "Thumbnail too large (max 512KB)" });
      }

      await sql`
        UPDATE maps SET thumbnail = ${buffer}, updated_at = now()
        WHERE id = ${mapId}
      `;
      return { ok: true };
    },
  );

  // Serve a map thumbnail
  fastify.get<{ Params: { mapSlug: string } }>(
    "/maps/:mapSlug/thumbnail",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const rows = await sql<Row[]>`
        SELECT thumbnail FROM maps WHERE id = ${mapId} LIMIT 1
      `;
      const thumb = rows[0]?.thumbnail;
      if (!thumb) return reply.status(404).send({ error: "No thumbnail" });

      return reply
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "public, max-age=300")
        .send(thumb);
    },
  );

  // Upload a feature image (JPEG/PNG/WebP blob, max 2MB)
  fastify.put<{ Params: { mapSlug: string; featureId: string } }>(
    "/maps/:mapSlug/features/:featureId/image",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ error: "Empty body" });
      }
      if (buffer.length > 2 * 1024 * 1024) {
        return reply.status(413).send({ error: "Image too large (max 2MB)" });
      }

      const result = await sql`
        UPDATE features SET image = ${buffer}
        WHERE id = ${req.params.featureId} AND map_id = ${mapId}
      `;
      if (result.count === 0) {
        return reply.status(404).send({ error: "Feature not found" });
      }
      return { ok: true };
    },
  );

  // Serve a feature image
  fastify.get<{ Params: { mapSlug: string; featureId: string } }>(
    "/maps/:mapSlug/features/:featureId/image",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      const rows = await sql<Row[]>`
        SELECT image FROM features
        WHERE id = ${req.params.featureId} AND map_id = ${mapId}
        LIMIT 1
      `;
      const image = rows[0]?.image;
      if (!image) return reply.status(404).send({ error: "No image" });

      return reply
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "public, max-age=300")
        .send(image);
    },
  );

  // Delete a feature image
  fastify.delete<{ Params: { mapSlug: string; featureId: string } }>(
    "/maps/:mapSlug/features/:featureId/image",
    async (req, reply) => {
      const mapId = await getMapId(req.userId, req.params.mapSlug);
      if (!mapId) return reply.status(404).send({ error: "Map not found" });

      await sql`
        UPDATE features SET image = NULL
        WHERE id = ${req.params.featureId} AND map_id = ${mapId}
      `;
      return { ok: true };
    },
  );
}
