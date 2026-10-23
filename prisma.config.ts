import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Not using env() here: it throws when unset, which breaks `prisma generate` in CI.
    url: process.env.DATABASE_URL ?? "",
  },
});
