/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn("features", {
    image: { type: "bytea", notNull: false },
  });
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("features", "image");
};
