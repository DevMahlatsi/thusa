import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

type Db = InstanceType<typeof PrismaClient>;

const globalForDb = globalThis as unknown as { thusaDb?: Db };

function createClient(): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: env().DATABASE_URL }) });
}

// Lazy singleton: survives Next.js hot reloads and doesn't connect at import time.
export function db(): Db {
  globalForDb.thusaDb ??= createClient();
  return globalForDb.thusaDb;
}
