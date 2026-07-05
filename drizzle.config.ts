import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.MUSE_DATA_DIR
      ? `${process.env.MUSE_DATA_DIR}/muse.db`
      : "./data/muse.db",
  },
});
