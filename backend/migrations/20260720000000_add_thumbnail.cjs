/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn("maps", {
    thumbnail: { type: "bytea", notNull: false },
  });
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("maps", "thumbnail");
};
