/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("users", {
    id: { type: "text", primaryKey: true },
    username: { type: "text", notNull: true, unique: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("maps", {
    id: { type: "text", primaryKey: true },
    user_id: { type: "text", notNull: true, references: "users(id)", onDelete: "CASCADE" },
    slug: { type: "text", notNull: true },
    title: { type: "text", notNull: true, default: "'Untitled Map'" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("maps", "maps_user_slug_unique", "UNIQUE (user_id, slug)");

  // Add map_id FK to existing tables
  pgm.addColumn("features", {
    map_id: { type: "text", references: "maps(id)", onDelete: "CASCADE" },
  });
  pgm.addColumn("folders", {
    map_id: { type: "text", references: "maps(id)", onDelete: "CASCADE" },
  });
  pgm.addColumn("layer_configs", {
    map_id: { type: "text", references: "maps(id)", onDelete: "CASCADE" },
  });
  pgm.addColumn("metadata", {
    map_id: { type: "text", references: "maps(id)", onDelete: "CASCADE" },
  });

  // Seed the dev user
  pgm.sql(`INSERT INTO users (id, username) VALUES ('user_chriswhong', 'chriswhong')`);
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("metadata", "map_id");
  pgm.dropColumn("layer_configs", "map_id");
  pgm.dropColumn("folders", "map_id");
  pgm.dropColumn("features", "map_id");
  pgm.dropTable("maps");
  pgm.dropTable("users");
};
