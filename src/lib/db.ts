import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Im Dev-Modus lädt Next.js Module neu – ein globaler Singleton verhindert Verbindungslecks.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Lazy, damit `next build` ohne DATABASE_URL nicht beim Import scheitert. */
export function getDb(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ist nicht gesetzt.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = client;
  return client;
}
