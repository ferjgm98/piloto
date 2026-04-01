import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./.context/piloto.db",
  },
  schema: "./src/bun/db/schema.ts",
  out: "./src/bun/db/migrations",
});
