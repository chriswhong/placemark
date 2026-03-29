import type { FastifyInstance } from "fastify";
import sql from "../db.js";

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
        sql<Row[]>`SELECT data FROM features WHERE map_id = ${mapId}`,
        sql<Row[]>`SELECT data FROM folders WHERE map_id = ${mapId}`,
        sql<Row[]>`SELECT data FROM layer_configs WHERE map_id = ${mapId}`,
        sql<Row[]>`SELECT data FROM metadata WHERE map_id = ${mapId} LIMIT 1`,
      ]);

      return {
        features: features.map((r) => r.data),
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
      });

      // Touch the map's updated_at
      await sql`UPDATE maps SET updated_at = now() WHERE id = ${mapId}`;

      return { ok: true };
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
}
