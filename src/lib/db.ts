import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The Prisma client, created once per process.
 *
 * Talks to the PostgreSQL container defined alongside the app in
 * docker-compose.yml, over the internal Docker network. That is deliberate: the
 * agency's plans stay on PSA hardware, and the app never needs outbound access
 * to a database on the public internet -- which the network here does not allow
 * on 5432 anyway.
 *
 * Construction is lazy. The client is only reachable from route handlers, and
 * building the app must not require a database -- `next build` evaluates route
 * modules, so a client constructed at module scope would make every build
 * depend on DATABASE_URL being present and valid.
 *
 * In development the instance is parked on `globalThis` because Next reloads
 * modules on every edit, and a fresh connection pool per reload exhausts the
 * server's connection limit within a few saves.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the server cannot reach the database.");
  }

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}
