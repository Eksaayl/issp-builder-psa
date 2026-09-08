import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * The Prisma client, created once per process.
 *
 * Construction is lazy. The client is only reachable from route handlers, and
 * building the app must not require a database -- `next build` evaluates route
 * modules, so a client constructed at module scope would make every build
 * depend on DATABASE_URL being present and valid.
 *
 * In development the instance is parked on `globalThis` because Next reloads
 * modules on every edit, and a fresh client per reload exhausts the connection
 * pool within a few saves.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the server cannot reach the database.");
  }

  const client = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
