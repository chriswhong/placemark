/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // GeoJSON features wrapped with Squidmaps metadata (id, at, folderId, feature)
  pgm.createTable("features", {
    id: { type: "text", primaryKey: true },
    data: { type: "jsonb", notNull: true },
  });

  // Folders for organising features
  pgm.createTable("folders", {
    id: { type: "text", primaryKey: true },
    data: { type: "jsonb", notNull: true },
  });

  // Tile / basemap layer configurations
  pgm.createTable("layer_configs", {
    id: { type: "text", primaryKey: true },
    data: { type: "jsonb", notNull: true },
  });

  // Singleton row for map-level metadata (symbolization, label column, etc.)
  pgm.createTable("metadata", {
    id: { type: "integer", primaryKey: true, default: 1 },
    data: { type: "jsonb", notNull: true, default: "{}" },
  });

  pgm.addConstraint("metadata", "metadata_single_row", "CHECK (id = 1)");

  pgm.sql("INSERT INTO metadata (id, data) VALUES (1, '{}')");
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("metadata");
  pgm.dropTable("layer_configs");
  pgm.dropTable("folders");
  pgm.dropTable("features");
};
