import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
});
export const db = globalDb.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
