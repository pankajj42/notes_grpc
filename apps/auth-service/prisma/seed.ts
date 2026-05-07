import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

if (typeof DATABASE_URL !== "string" || DATABASE_URL.trim() === "") {
  throw new Error("DATABASE_URL is required for auth-service seed");
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const USERS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "demo1@example.com",
    password: "Password123!",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "demo2@example.com",
    password: "Password123!",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "demo3@example.com",
    password: "Password123!",
  },
] as const;

async function main(): Promise<void> {
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);

    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        email: user.email,
        passwordHash,
      },
      update: {
        passwordHash,
      },
    });
  }

  // Create one active session per seeded user for session-management UI demos.
  for (const user of USERS) {
    const refreshTokenHash = await bcrypt.hash(`${user.id}.seed.refresh`, 12);

    await prisma.session.upsert({
      where: { id: `${user.id.slice(0, 8)}-aaaa-4aaa-8aaa-${user.id.slice(-12)}` },
      create: {
        id: `${user.id.slice(0, 8)}-aaaa-4aaa-8aaa-${user.id.slice(-12)}`,
        userId: user.id,
        refreshTokenHash,
        deviceName: "Seeded Device",
        userAgent: "Seed Script",
        ipAddress: "127.0.0.1",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        refreshTokenHash,
        revokedAt: null,
        lockedAt: null,
        failedRefreshAttempts: 0,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`Seeded auth database with ${String(USERS.length)} users`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
