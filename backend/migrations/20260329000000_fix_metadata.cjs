/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Drop the old singleton metadata table (id INTEGER PRIMARY KEY CHECK (id=1))
  // and replace it with a per-map table keyed by map_id.
  pgm.dropTable("metadata");

  pgm.createTable("metadata", {
    map_id: {
      type: "text",
      primaryKey: true,
      references: "maps(id)",
      onDelete: "CASCADE",
    },
    data: { type: "jsonb", notNull: true, default: "{}" },
  });
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("metadata");

  pgm.createTable("metadata", {
    id: { type: "integer", primaryKey: true, default: 1 },
    data: { type: "jsonb", notNull: true, default: "{}" },
  });

  pgm.addConstraint("metadata", "metadata_single_row", "CHECK (id = 1)");
  pgm.sql("INSERT INTO metadata (id, data) VALUES (1, '{}')");
};
